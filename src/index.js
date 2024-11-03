import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { createCommitment, verifyCommitment, listCommitments, deleteCommitment, getRecap, getActiveCommitments } from './commitments.js';
import { initializeDatabase, closeDatabase } from './database.js';
import { analyzeImage } from './imageAnalysis.js';
import { config } from './config.js';
import { commands } from './commands/index.js';
import { createCommitmentEmbed, createDeleteEmbed } from './utils/embedCreator.js';
import { createRecapEmbed, sendRecap } from './utils/recapManager.js';
import cron from 'node-cron';
import { zonedTimeToUtc } from 'date-fns-tz';

dotenv.config();

const requiredEnvVars = ['DISCORD_TOKEN', 'APPLICATION_ID', 'OPENAI_API_KEY', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  failIfNotExists: false,
  retryLimit: 5,
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.APPLICATION_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
    throw error;
  }
}

// Schedule daily recap at 4 AM EST
cron.schedule('0 4 * * *', () => {
  const estTime = zonedTimeToUtc(new Date(), 'America/New_York');
  console.log(`Running daily recap at ${estTime}`);
  sendRecap(client, 'daily');
}, {
  timezone: 'America/New_York'
});

// Schedule weekly recap on Sunday at 8 PM EST
cron.schedule('0 20 * * 0', () => {
  const estTime = zonedTimeToUtc(new Date(), 'America/New_York');
  console.log(`Running weekly recap at ${estTime}`);
  sendRecap(client, 'weekly');
}, {
  timezone: 'America/New_York'
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'commitment') {
      try {
        const commitments = await getActiveCommitments(interaction.user.id);
        const filtered = commitments
          .filter(c => c.commitment.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map(c => ({
            name: `${c.commitment} (${c.type})`,
            value: c._id.toString()
          }));

        await interaction.respond(filtered);
      } catch (error) {
        console.error('Error handling autocomplete:', error);
        await interaction.respond([]);
      }
    }
    return;
  }

  if (!interaction.isCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'commit': {
        const commitment = interaction.options.getString('goal');
        const type = interaction.options.getString('type');
        const isRecurring = interaction.options.getBoolean('recurring');
        
        let recurringOptions = null;
        if (isRecurring) {
          const days = interaction.options.getString('days');
          const endDate = interaction.options.getString('end_date');
          
          if (!days) {
            await interaction.reply({
              content: '❌ Days must be specified for recurring commitments (e.g., mon,tue,wed)',
              ephemeral: true
            });
            return;
          }
          
          recurringOptions = { days, endDate };
        }

        const newCommitment = await createCommitment(
          interaction.user.id,
          commitment,
          type,
          recurringOptions
        );

        await interaction.reply({
          embeds: [createCommitmentEmbed(newCommitment, interaction.user)]
        });
        break;
      }

      case 'list': {
        const type = interaction.options.getString('type') || 'all';
        const commitments = await listCommitments(interaction.user.id, type);
        if (!commitments.length) {
          await interaction.reply({ 
            content: `No ${type} commitments found.`,
            ephemeral: true 
          });
          return;
        }
        
        const embeds = commitments.map(c => createCommitmentEmbed(c, interaction.user));
        await interaction.reply({ 
          embeds,
          ephemeral: true 
        });
        break;
      }

      case 'verify': {
        const attachment = interaction.options.getAttachment('proof');
        const commitmentId = interaction.options.getString('commitment');
        
        if (!attachment?.contentType?.startsWith('image/')) {
          await interaction.reply({
            content: '❌ Please provide an image file as proof.',
            ephemeral: true
          });
          return;
        }
        
        await interaction.deferReply();
        const extractedText = await analyzeImage(attachment.url);
        const { commitment: verifiedCommitment, gptAnalysis } = await verifyCommitment(
          interaction.user.id,
          commitmentId,
          attachment.url,
          extractedText
        );
        
        await interaction.editReply({
          embeds: [createCommitmentEmbed(verifiedCommitment, interaction.user)]
        });
        break;
      }

      case 'delete': {
        const commitmentId = interaction.options.getString('commitment');
        const deletedCommitment = await deleteCommitment(interaction.user.id, commitmentId);
        await interaction.reply({ 
          embeds: [createDeleteEmbed(deletedCommitment)],
          ephemeral: true 
        });
        break;
      }

      case 'recap': {
        const type = interaction.options.getString('type');
        const recap = await getRecap(type);
        const embed = await createRecapEmbed(client, recap, type, interaction.guild);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      default:
        await interaction.reply({
          content: '❌ Unknown command',
          ephemeral: true
        });
    }
  } catch (error) {
    console.error('Error handling command:', error);
    const errorMessage = error.message || 'An error occurred while processing your command.';
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `❌ ${errorMessage}`,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: `❌ ${errorMessage}`
      });
    }
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  
  try {
    await initializeDatabase();
    await registerCommands();
  } catch (error) {
    console.error('❌ Initialization error:', error);
    process.exit(1);
  }
});

client.on(Events.Error, error => {
  console.error('❌ Discord client error:', error);
});

let connectionAttempts = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

async function connectWithRetry() {
  try {
    console.log(`Connection attempt ${connectionAttempts + 1}/${MAX_RETRIES}`);
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('❌ Discord connection error:', error);
    connectionAttempts++;
    
    if (connectionAttempts < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
      setTimeout(connectWithRetry, RETRY_DELAY);
    } else {
      console.error('❌ Max connection attempts reached. Exiting...');
      process.exit(1);
    }
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('Shutting down gracefully...');
  await closeDatabase();
  client.destroy();
  process.exit(0);
}

console.log('Starting Discord bot...');
connectWithRetry().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});