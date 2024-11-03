import { EmbedBuilder } from 'discord.js';
import { getRecap } from '../commitments.js';
import { format, isWithinInterval, parseISO, eachDayOfInterval } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

function formatDailyStatus(dailyStatus, commitment, start, end) {
  if (!dailyStatus || Object.keys(dailyStatus).length === 0) return '';
  
  // Get all days in the interval
  const days = eachDayOfInterval({ start, end });
  
  // Create a map of all scheduled days with their status
  const statusMap = days.reduce((acc, day) => {
    const dayName = format(day, 'EEEE').toLowerCase();
    if (commitment.recurring && commitment.recurring.days.includes(dayName)) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const status = dailyStatus[dateStr] || { completed: false, scheduled: true };
      acc[dateStr] = status;
    }
    return acc;
  }, {});

  return Object.entries(statusMap)
    .map(([dateStr, status]) => {
      const emoji = status.completed ? '✅' : '❌';
      const date = parseISO(dateStr);
      const estDate = utcToZonedTime(date, 'America/New_York');
      return `${format(estDate, 'EEE, MMM d')}: ${emoji}`;
    })
    .sort((a, b) => {
      const dateA = new Date(a.split(':')[0]);
      const dateB = new Date(b.split(':')[0]);
      return dateA - dateB;
    })
    .join('\n');
}

function isRecurringCommitmentCompleted(commitment) {
  if (!commitment.dailyStatus) return false;
  
  const scheduledDays = Object.values(commitment.dailyStatus)
    .filter(status => status.scheduled);
  
  return scheduledDays.length > 0 && 
    scheduledDays.every(status => status.completed);
}

export async function createRecapEmbed(client, recap, type, guild) {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${type === 'daily' ? 'Daily' : 'Weekly'} Commitment Recap`)
    .setDescription(
      `${guild ? `Overview for ${guild.name}` : 'Commitment Overview'}\n` +
      `Period: ${format(recap.start, 'PPp')} to ${format(recap.end, 'PPp')}`
    )
    .addFields([
      { 
        name: '📊 Overall Stats', 
        value: `Total Commitments: ${recap.total}\nCompleted: ${recap.completed}${recap.total > 0 ? ` (${Math.round(recap.completed/recap.total*100)}%)` : ''}`
      }
    ]);

  if (recap.total === 0) {
    embed.addFields([{
      name: 'No Commitments',
      value: `No ${type} commitments were made during this period.`
    }]);
    return embed;
  }

  const userPromises = Object.keys(recap.userStats).map(async userId => {
    try {
      let user = guild?.members.cache.get(userId)?.user;
      if (!user) {
        try {
          user = await client.users.fetch(userId);
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error);
        }
      }
      return [userId, user];
    } catch (error) {
      console.error(`Error fetching user ${userId}:`, error);
      return [userId, null];
    }
  });

  const users = await Promise.all(userPromises);
  const userMap = Object.fromEntries(users);

  for (const [userId, stats] of Object.entries(recap.userStats)) {
    const user = userMap[userId];
    const username = user ? user.tag : `User ${userId}`;
    
    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    embed.addFields({
      name: `👤 ${username}`,
      value: `Completion Rate: ${stats.completed}/${stats.total} (${completionRate}%)`
    });

    stats.commitments.forEach((commitment, index) => {
      const isCompleted = commitment.recurring ? 
        isRecurringCommitmentCompleted(commitment) : 
        commitment.completed;
      
      const statusEmoji = isCompleted ? '✅' : '⏳';
      let fieldValue = `**Status:** ${statusEmoji} ${isCompleted ? 'Completed' : 'In Progress'}\n`;

      if (commitment.recurring) {
        const days = commitment.recurring.days
          .map(day => day.charAt(0).toUpperCase() + day.slice(1))
          .join(', ');
        fieldValue += `**Schedule:** Every ${days}\n`;

        const dailyStatusText = formatDailyStatus(commitment.dailyStatus, commitment, recap.start, recap.end);
        if (dailyStatusText) {
          fieldValue += `\n**Daily Progress:**\n${dailyStatusText}`;
        }
      }

      embed.addFields({
        name: `${index + 1}. ${commitment.commitment}`,
        value: fieldValue,
        inline: false
      });
    });

    if (Object.keys(recap.userStats).indexOf(userId) !== Object.keys(recap.userStats).length - 1) {
      embed.addFields({ name: '\u200B', value: '\u200B' });
    }
  }

  embed.setTimestamp();
  return embed;
}

export async function sendRecap(client, type) {
  try {
    const recap = await getRecap(type, true);
    
    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.members.fetch();
        const embed = await createRecapEmbed(client, recap, type, guild);
        
        const channel = guild.channels.cache
          .find(channel => 
            channel.type === 0 && 
            channel.permissionsFor(client.user)?.has('SendMessages')
          );
        
        if (channel) {
          await channel.send({ embeds: [embed] });
        } else {
          console.warn(`No suitable channel found in guild ${guild.id}`);
        }
      } catch (error) {
        console.error(`Error sending ${type} recap to guild ${guild.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error generating ${type} recap:`, error);
  }
}