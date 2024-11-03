import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('commit')
    .setDescription('Create a new commitment')
    .addStringOption(option =>
      option
        .setName('goal')
        .setDescription('What do you want to commit to?')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Type of commitment')
        .setRequired(true)
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' }
        )
    )
    .addBooleanOption(option =>
      option
        .setName('recurring')
        .setDescription('Is this a recurring commitment?')
    )
    .addStringOption(option =>
      option
        .setName('days')
        .setDescription('Days for recurring commitment (comma-separated, e.g., mon,tue,wed)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('end_date')
        .setDescription('End date for recurring commitment (YYYY-MM-DD)')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('list')
    .setDescription('List your current commitments')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Type of commitments to list')
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'All', value: 'all' }
        )
    ),
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify a commitment with a screenshot')
    .addStringOption(option =>
      option
        .setName('commitment')
        .setDescription('Select the commitment to verify')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addAttachmentOption(option =>
      option
        .setName('proof')
        .setDescription('Upload a screenshot as proof')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete a commitment')
    .addStringOption(option =>
      option
        .setName('commitment')
        .setDescription('Select the commitment to delete')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('recap')
    .setDescription('Show commitment recap')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Type of recap')
        .setRequired(true)
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' }
        )
    )
];