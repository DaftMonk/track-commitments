import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, format, isSameDay, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';
import { Commitment } from './models/Commitment.js';
import { verifyWithGPT } from './gptVerification.js';

function parseRecurringDays(daysString) {
  const dayMap = {
    'mon': 'monday',
    'tue': 'tuesday',
    'wed': 'wednesday',
    'thu': 'thursday',
    'fri': 'friday',
    'sat': 'saturday',
    'sun': 'sunday',
    'monday': 'monday',
    'tuesday': 'tuesday',
    'wednesday': 'wednesday',
    'thursday': 'thursday',
    'friday': 'friday',
    'saturday': 'saturday',
    'sunday': 'sunday'
  };

  const days = daysString.toLowerCase().split(',').map(day => day.trim());
  const normalizedDays = days.map(day => dayMap[day]);
  
  const invalidDays = normalizedDays.filter(day => !day);
  if (invalidDays.length > 0) {
    throw new Error(`Invalid days: ${days.filter((_, i) => !normalizedDays[i]).join(', ')}`);
  }
  
  return normalizedDays;
}

function getDateRange(type, isAutomated = false) {
  const now = new Date();
  const estNow = zonedTimeToUtc(now, 'America/New_York');
  
  if (type === 'daily') {
    const today4am = zonedTimeToUtc(
      new Date(estNow).setHours(4, 0, 0, 0),
      'America/New_York'
    );
    
    let start, end;
    if (isAutomated) {
      start = new Date(today4am.getTime() - 24 * 60 * 60 * 1000);
      end = today4am;
    } else {
      start = estNow.getHours() < 4 ? 
        new Date(today4am.getTime() - 24 * 60 * 60 * 1000) :
        today4am;
      end = estNow;
    }
    
    return { start, end };
  } else {
    const weekStart = startOfWeek(estNow, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(estNow, { weekStartsOn: 0 });
    
    if (isAutomated) {
      return {
        start: new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: weekStart
      };
    } else {
      return {
        start: weekStart,
        end: estNow
      };
    }
  }
}

export async function createCommitment(userId, commitment, type, recurringOptions = null) {
  try {
    const commitmentData = {
      userId,
      commitment,
      type
    };

    if (recurringOptions) {
      const days = parseRecurringDays(recurringOptions.days);
      commitmentData.recurring = {
        days,
        endDate: recurringOptions.endDate ? new Date(recurringOptions.endDate) : null,
        completions: []
      };
    }

    const newCommitment = await Commitment.create(commitmentData);
    return newCommitment;
  } catch (error) {
    console.error('Error creating commitment:', error);
    throw new Error('Failed to create commitment');
  }
}

export async function verifyCommitment(userId, commitmentId, imageUrl, extractedText) {
  try {
    const commitment = await Commitment.findOne({
      _id: commitmentId,
      userId
    });

    if (!commitment) {
      throw new Error('Commitment not found');
    }

    const gptAnalysis = await verifyWithGPT(commitment.commitment, extractedText, imageUrl);
    const proof = {
      imageUrl,
      extractedText,
      gptAnalysis: JSON.stringify(gptAnalysis),
      isValid: gptAnalysis.isValid
    };

    const now = new Date();
    
    if (commitment.recurring) {
      const today = format(now, 'yyyy-MM-dd');
      const existingCompletion = commitment.recurring.completions.find(c => 
        format(c.date, 'yyyy-MM-dd') === today
      );

      if (existingCompletion) {
        existingCompletion.completed = gptAnalysis.isValid;
        existingCompletion.proof = proof;
      } else {
        commitment.recurring.completions.push({
          date: now,
          completed: gptAnalysis.isValid,
          proof
        });
      }
    } else {
      commitment.proofs.push(proof);
      if (gptAnalysis.isValid) {
        commitment.completed = true;
      }
    }

    await commitment.save();
    return { commitment, gptAnalysis };
  } catch (error) {
    console.error('Error verifying commitment:', error);
    throw new Error('Failed to verify commitment');
  }
}

export async function listCommitments(userId, type = 'all') {
  try {
    const query = { userId };
    
    if (type !== 'all') {
      const { start, end } = getDateRange(type, false);
      query.type = type;
      query.createdAt = {
        $gte: start,
        $lte: end
      };
    }

    const commitments = await Commitment.find(query).sort({ createdAt: -1 });
    return commitments;
  } catch (error) {
    console.error('Error listing commitments:', error);
    throw new Error('Failed to list commitments');
  }
}

export async function getActiveCommitments(userId) {
  try {
    const now = new Date();
    const estNow = zonedTimeToUtc(now, 'America/New_York');
    
    const today4am = zonedTimeToUtc(
      new Date(estNow).setHours(4, 0, 0, 0),
      'America/New_York'
    );
    
    const dailyStart = estNow.getHours() < 4 ? 
      new Date(today4am.getTime() - 24 * 60 * 60 * 1000) :
      today4am;
      
    const weekStart = startOfWeek(estNow, { weekStartsOn: 0 });

    const query = {
      userId,
      $or: [
        {
          recurring: { $exists: false },
          completed: false,
          $or: [
            {
              type: 'daily',
              createdAt: { $gte: dailyStart, $lte: estNow }
            },
            {
              type: 'weekly',
              createdAt: { $gte: weekStart, $lte: estNow }
            }
          ]
        },
        {
          recurring: { $exists: true },
          $or: [
            { 'recurring.endDate': null },
            { 'recurring.endDate': { $gte: estNow } }
          ]
        }
      ]
    };

    const commitments = await Commitment.find(query).sort({ createdAt: -1 });
    
    return commitments.filter(commitment => {
      if (!commitment.recurring) return true;
      
      const dayName = format(estNow, 'EEEE').toLowerCase();
      return commitment.recurring.days.includes(dayName);
    });
  } catch (error) {
    console.error('Error getting active commitments:', error);
    throw new Error('Failed to get active commitments');
  }
}

export async function deleteCommitment(userId, commitmentId) {
  try {
    const commitment = await Commitment.findOneAndDelete({
      _id: commitmentId,
      userId
    });

    if (!commitment) {
      throw new Error('Commitment not found');
    }

    return commitment;
  } catch (error) {
    console.error('Error deleting commitment:', error);
    throw new Error('Failed to delete commitment');
  }
}

export async function getRecap(type, isAutomated = false) {
  try {
    const { start, end } = getDateRange(type, isAutomated);
    
    if (!start || !end || start >= end) {
      throw new Error('Invalid date range');
    }

    const commitments = await Commitment.find({
      $or: [
        {
          recurring: { $exists: false },
          createdAt: { $gte: start, $lt: end }
        },
        {
          recurring: { $exists: true },
          createdAt: { $lt: end },
          $or: [
            { 'recurring.endDate': null },
            { 'recurring.endDate': { $gte: start } }
          ]
        }
      ]
    }).sort({ createdAt: -1 });

    const processedCommitments = commitments.map(commitment => {
      if (!commitment.recurring) {
        return commitment;
      }

      const dailyStatus = {};
      const days = eachDayOfInterval({ start, end });

      days.forEach(day => {
        const dayName = format(day, 'EEEE').toLowerCase();
        if (commitment.recurring.days.includes(dayName)) {
          const dateStr = format(day, 'yyyy-MM-dd');
          const completion = commitment.recurring.completions.find(c => 
            format(new Date(c.date), 'yyyy-MM-dd') === dateStr
          );
          
          dailyStatus[dateStr] = {
            completed: completion?.completed || false,
            proof: completion?.proof || null,
            scheduled: true
          };
        }
      });

      const filteredDailyStatus = Object.entries(dailyStatus)
        .filter(([_, status]) => status.scheduled)
        .reduce((acc, [date, status]) => {
          acc[date] = status;
          return acc;
        }, {});

      return {
        ...commitment.toObject(),
        dailyStatus: filteredDailyStatus
      };
    });

    const userStats = {};
    for (const commitment of processedCommitments) {
      if (!userStats[commitment.userId]) {
        userStats[commitment.userId] = {
          commitments: [],
          completed: 0,
          total: 0
        };
      }

      const userStat = userStats[commitment.userId];
      userStat.commitments.push(commitment);
      
      if (commitment.recurring) {
        const scheduledDays = Object.values(commitment.dailyStatus || {});
        const completedDays = scheduledDays.filter(s => s.completed).length;
        userStat.completed += completedDays;
        userStat.total += scheduledDays.length;
      } else {
        userStat.total++;
        if (commitment.completed) {
          userStat.completed++;
        }
      }
    }

    const totalCompleted = Object.values(userStats).reduce((sum, stat) => sum + stat.completed, 0);
    const totalCommitments = Object.values(userStats).reduce((sum, stat) => sum + stat.total, 0);

    return {
      start,
      end,
      total: totalCommitments,
      completed: totalCompleted,
      userStats
    };
  } catch (error) {
    console.error('Error generating recap:', error);
    throw new Error('Failed to generate recap');
  }
}