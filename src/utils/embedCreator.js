import { EmbedBuilder } from 'discord.js';

export function createCommitmentEmbed(commitment, user, showVerification = true) {
  const embed = new EmbedBuilder()
    .setColor(commitment.completed ? 0x00FF00 : 0xFFA500)
    .setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL()
    })
    .setTitle('Commitment Tracker')
    .addFields([
      { 
        name: 'Type', 
        value: commitment.type ? 
          commitment.type.charAt(0).toUpperCase() + commitment.type.slice(1) : 
          'Unspecified',
        inline: true
      },
      { 
        name: 'Status', 
        value: commitment.recurring ? '⏳ In Progress' : (commitment.completed ? '✅ Completed' : '⏳ In Progress'),
        inline: true
      },
      { 
        name: 'Commitment', 
        value: commitment?.commitment || 'Unknown'
      }
    ]);

  if (commitment.recurring) {
    const days = commitment.recurring.days.map(day => 
      day.charAt(0).toUpperCase() + day.slice(1)
    ).join(', ');
    
    embed.addFields({
      name: 'Recurring Schedule',
      value: `Every: ${days}${commitment.recurring.endDate ? 
        `\nUntil: ${commitment.recurring.endDate.toLocaleDateString()}` : 
        '\nNo end date'}`
    });

    // Show latest verification if available and requested
    if (showVerification && commitment.recurring.completions?.length > 0) {
      const latestCompletion = commitment.recurring.completions[commitment.recurring.completions.length - 1];
      if (latestCompletion.proof) {
        const analysis = JSON.parse(latestCompletion.proof.gptAnalysis);
        embed.addFields([
          {
            name: 'Verification Status',
            value: analysis.isValid ? '✅ Verified' : '❌ Not Verified',
            inline: true
          },
          {
            name: 'AI Analysis',
            value: analysis.explanation
          },
          {
            name: 'Confidence',
            value: analysis.confidence,
            inline: true
          }
        ]);

        if (latestCompletion.proof.imageUrl) {
          embed.setImage(latestCompletion.proof.imageUrl);
        }
      }
    }
  } else if (showVerification && commitment.proofs?.length > 0) {
    const latestProof = commitment.proofs[commitment.proofs.length - 1];
    const analysis = JSON.parse(latestProof.gptAnalysis);
    
    embed.addFields([
      {
        name: 'Verification Status',
        value: analysis.isValid ? '✅ Verified' : '❌ Not Verified',
        inline: true
      },
      {
        name: 'AI Analysis',
        value: analysis.explanation
      },
      {
        name: 'Confidence',
        value: analysis.confidence,
        inline: true
      }
    ]);

    if (latestProof.imageUrl) {
      embed.setImage(latestProof.imageUrl);
    }
  }

  embed.setTimestamp();
  return embed;
}

export function createDeleteEmbed(commitment) {
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('Commitment Deleted')
    .addFields([
      {
        name: 'Type',
        value: commitment?.type ? 
          commitment.type.charAt(0).toUpperCase() + commitment.type.slice(1) : 
          'Unspecified',
        inline: true
      },
      {
        name: 'Status',
        value: commitment?.completed ? '✅ Completed' : '⏳ In Progress',
        inline: true
      },
      {
        name: 'Deleted Commitment',
        value: commitment?.commitment || 'Unknown'
      }
    ]);

  if (commitment?.recurring) {
    const days = commitment.recurring.days.map(day => 
      day.charAt(0).toUpperCase() + day.slice(1)
    ).join(', ');
    
    embed.addFields({
      name: 'Recurring Schedule',
      value: `Every: ${days}${commitment.recurring.endDate ? 
        `\nUntil: ${commitment.recurring.endDate.toLocaleDateString()}` : 
        '\nNo end date'}`
    });
  }

  embed.setTimestamp();
  return embed;
}