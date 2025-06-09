require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Configuration
const TEACHER_ID = '1374070945412546643'; // For DM reports
const LESSON_FILE_PATH = path.join(__dirname, 'lessons.json');

// Student XP tracking
let studentXP = {};
const XP_SAVE_PATH = path.join(__dirname, 'student_xp.json');

// Active discussion tracking
const activeDiscussions = {};

// Load stored XP data
async function loadXPData() {
  try {
    const data = await fs.readFile(XP_SAVE_PATH, 'utf8');
    studentXP = JSON.parse(data);
    console.log('XP data loaded successfully');
  } catch (error) {
    console.log('No existing XP data found, starting fresh');
    studentXP = {};
  }
}

// Save XP data to file
async function saveXPData() {
  try {
    await fs.writeFile(XP_SAVE_PATH, JSON.stringify(studentXP, null, 2));
    console.log('XP data saved successfully');
  } catch (error) {
    console.error('Error saving XP data:', error);
  }
}

// Award XP to a student
function awardXP(studentId, studentName, points, reason) {
  if (!studentXP[studentId]) {
    studentXP[studentId] = {
      id: studentId,
      name: studentName,
      points: 0,
      contributions: []
    };
  }
  
  studentXP[studentId].points += points;
  studentXP[studentId].contributions.push({
    points,
    reason,
    timestamp: Date.now()
  });
  
  // Save the updated XP data
  saveXPData();
  
  return studentXP[studentId].points; // Return new total
}

// Load lesson plans
async function loadLessons() {
  try {
    const data = await fs.readFile(LESSON_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading lesson file:', error);
    return {
      lessons: [
        {
          id: "default",
          title: "Default Lesson",
          description: "This is a placeholder lesson.",
          learningObjectives: ["Understand place value", "Practice decimal operations"],
          discussionFlow: [
            {
              question: "What patterns do you notice in these decimal multiplication problems?",
              expectedInsights: ["The decimal point moves", "Multiplying by 0.1 makes the number smaller"],
              followupQuestions: ["Why does that happen?", "Can you explain why multiplying by 0.1 is the same as dividing by 10?"]
            }
          ],
          keyTakeaways: ["Multiplying by 0.1 is equivalent to dividing by 10", "Decimal placement follows patterns"]
        }
      ]
    };
  }
}

// Call DeepSeek API
async function callDeepSeek(messages) {
  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: "deepseek-chat",
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling DeepSeek API:', error);
    return 'I encountered an issue while processing. Please try again later.';
  }
}

// Start a new facilitated discussion
async function startDiscussion(channel, teamName, lessonId) {
  const lessons = await loadLessons();
  const lesson = lessons.lessons.find(l => l.id === lessonId) || lessons.lessons[0];
  
  // Create a new discussion session
  activeDiscussions[channel.id] = {
    lessonId,
    teamName,
    startTime: Date.now(),
    currentStage: 0,
    studentParticipation: {},
    insightsCovered: [],
    discussion: []
  };
  
  // Send introduction message
  const embed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle(`🔢 Team ${teamName} - ${lesson.title} 🧮`)
    .setDescription(`**Welcome to our discussion on ${lesson.title}!** Today we'll be exploring some interesting math concepts together. Share your ideas, ask questions, and build on each other's thinking!`)
    .addFields(
      { name: '🎯 Learning Goals', value: lesson.learningObjectives.map(obj => `📐 ${obj}`).join('\n') },
      { name: '🏆 XP System', value: '✨ **+10 XP** for each mathematical insight you share\n📝 **+2 XP** for active participation\n🔍 Look for patterns and make connections to earn more XP!' }
    )
    .setFooter({ text: "I will be guiding our discussion today! Let's have fun with math!" });
  
  await channel.send({ embeds: [embed] });
  
  // Start with the first question after a short delay
  setTimeout(() => {
    moveToNextStage(channel);
  }, 5000);
}

// Move to the next discussion stage
async function moveToNextStage(channel) {
  const discussion = activeDiscussions[channel.id];
  if (!discussion) return;
  
  const lessons = await loadLessons();
  const lesson = lessons.lessons.find(l => l.id === discussion.lessonId) || lessons.lessons[0];
  
  // Check if we've completed all stages
  if (discussion.currentStage >= lesson.discussionFlow.length) {
    // Conclude the discussion
    concludeDiscussion(channel);
    return;
  }
  
  const currentQuestion = lesson.discussionFlow[discussion.currentStage];
  
  // Send the current question
  await channel.send(`**Question ${discussion.currentStage + 1}:** ${currentQuestion.question}`);
  
  // Update the discussion state
  discussion.currentStage++;
}

// Process a student message within a discussion
async function processStudentMessage(message) {
  const discussion = activeDiscussions[message.channel.id];
  if (!discussion) return; // Not in an active discussion
  
  const lessons = await loadLessons();
  const lesson = lessons.lessons.find(l => l.id === discussion.lessonId) || lessons.lessons[0];
  const currentStage = discussion.currentStage - 1;
  const currentQuestion = lesson.discussionFlow[currentStage];
  
  // Track this student's participation
  const studentId = message.author.id;
  const studentName = message.author.username;
  
  if (!discussion.studentParticipation[studentId]) {
    discussion.studentParticipation[studentId] = {
      name: studentName,
      messages: 0,
      insightsCovered: []
    };
  }
  
  discussion.studentParticipation[studentId].messages++;
  
  // Add this message to the discussion record
  discussion.discussion.push({
    role: "student",
    name: studentName,
    content: message.content,
    timestamp: Date.now()
  });
  
  // Generate AI response using DeepSeek
  const systemPrompt = `You are a math discussion facilitator for Team ${discussion.teamName}, a middle school math group. 
Current lesson: "${lesson.title}"
Current question: "${currentQuestion.question}"
Expected insights: ${JSON.stringify(currentQuestion.expectedInsights)}
Follow-up questions: ${JSON.stringify(currentQuestion.followupQuestions)}

Your role is to:
1. Acknowledge student contributions positively
2. Identify when students make points related to the expected insights
3. Guide the discussion toward the learning objectives by asking follow-up questions
4. Encourage participation from students who haven't contributed yet
5. Use an encouraging tone appropriate for middle school students

The student named ${studentName} just said: "${message.content}"

Respond to them directly, using their name. If they made a point that aligns with an expected insight, acknowledge that specifically.
If appropriate, ask one of the follow-up questions or encourage deeper thinking.
Keep your response conversational, encouraging, and under 150 words.
DO NOT mention that you're tracking insights or following a lesson plan.`;

  const aiResponse = await callDeepSeek([{ role: 'system', content: systemPrompt }]);
  
  // Check if the student message covers any expected insights
  const insightCheck = await callDeepSeek([
    { 
      role: 'system', 
      content: `You are an insight detector. Analyze if the student's message demonstrates understanding of any of the expected insights. 
      Return ONLY a JSON array of matched insight indices (0-based) or an empty array if no insights detected.
      Expected insights: ${JSON.stringify(currentQuestion.expectedInsights)}` 
    },
    { role: 'user', content: message.content }
  ]);
  
  let detectedInsights = [];
  try {
    // Try to parse the response as JSON array of indices
    const parsed = JSON.parse(insightCheck.replace(/```json|```/g, '').trim());
    if (Array.isArray(parsed)) {
      detectedInsights = parsed;
    }
  } catch (e) {
    // If parsing fails, manually check for numbers in the response
    const matches = insightCheck.match(/\d+/g);
    if (matches) {
      detectedInsights = matches.map(Number).filter(n => n < currentQuestion.expectedInsights.length);
    }
  }
  
  // Award XP for insights if they haven't been covered by this student yet
  let xpAwarded = 0;
  const newInsights = detectedInsights.filter(i => !discussion.studentParticipation[studentId].insightsCovered.includes(i));
  
  if (newInsights.length > 0) {
    // Award XP for each new insight
    xpAwarded = newInsights.length * 10;
    const insightDescriptions = newInsights.map(i => currentQuestion.expectedInsights[i]);
    
    const totalXP = awardXP(studentId, studentName, xpAwarded, 
      `Shared insight(s): ${insightDescriptions.join(', ')} during "${lesson.title}"`);
    
    // Track which insights this student has covered
    discussion.studentParticipation[studentId].insightsCovered.push(...newInsights);
    
    // Also track overall insights covered in the discussion
    discussion.insightsCovered = [...new Set([...discussion.insightsCovered, ...newInsights])];
    
    // Add XP notification to the response with enhanced visuals
    const xpEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(`🎉 ${studentName} earned XP! 🎉`)
      .setDescription(`✨ **+${xpAwarded} XP** for sharing insight: *"${insightDescriptions[0]}"*\n\n📊 Total XP: **${totalXP}**`)
      .setFooter({ text: '🔔 Keep sharing your mathematical thinking!' });
    
    await message.channel.send({ embeds: [xpEmbed] });
  } else {
    // Award small XP for participation if no new insight
    xpAwarded = 2;
    const totalXP = awardXP(studentId, studentName, xpAwarded, "Active participation");
  }
  
  // Send the AI response
  await message.channel.send(aiResponse);
  
  // Add AI response to the discussion record
  discussion.discussion.push({
    role: "facilitator",
    content: aiResponse,
    timestamp: Date.now()
  });
  
  // Check if all expected insights have been covered
  if (discussion.insightsCovered.length >= currentQuestion.expectedInsights.length) {
    setTimeout(() => {
      // Summarize this question before moving on
      summarizeQuestionDiscussion(message.channel);
    }, 10000); // Give students time to read the last response
  } else if (!discussion.questionTimer) {
    // Set a time limit for this question (5 minutes)
    discussion.questionTimer = setTimeout(() => {
      const missedInsights = currentQuestion.expectedInsights.filter((_, index) => !discussion.insightsCovered.includes(index));
      const missedCount = missedInsights.length;
      
      // Create a hint embed for missed insights
      const hintEmbed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('⏰ Time to move forward!')
        .setDescription(`We've had a great discussion on this question! ${missedCount > 0 ? `There were ${missedCount} more key point${missedCount > 1 ? 's' : ''} we could have explored:` : 'We covered all the key points!'}`)
        .setFooter({ text: 'Moving to the next part of our discussion soon...' });
      
      // Add hints about missed insights if any
      if (missedCount > 0) {
        // Add a simplified version of the missed insights without giving everything away
        const hints = missedInsights.map(insight => {
          // Create a hint by showing partial insight
          const words = insight.split(' ');
          const hintWords = words.slice(0, Math.min(5, words.length));
          return `🔍 *"${hintWords.join(' ')}..."*`;
        });
        hintEmbed.addFields({ name: 'Some hints to consider:', value: hints.join('\n') });
      }
      
      message.channel.send({ embeds: [hintEmbed] });
      
      // Move to next question after a brief delay
      setTimeout(() => {
        summarizeQuestionDiscussion(message.channel);
      }, 15000);
    }, 5 * 60 * 1000); // 5 minute timer
  }
}

// Summarize the discussion on the current question
async function summarizeQuestionDiscussion(channel) {
  const discussion = activeDiscussions[channel.id];
  if (!discussion) return;
  
  const lessons = await loadLessons();
  const lesson = lessons.lessons.find(l => l.id === discussion.lessonId) || lessons.lessons[0];
  const currentStage = discussion.currentStage - 1;
  const currentQuestion = lesson.discussionFlow[currentStage];
  
  // Generate a summary of the discussion so far
  const discussionText = discussion.discussion
    .filter(msg => msg.role === 'student')
    .map(msg => `${msg.name}: ${msg.content}`)
    .join('\n');
  
  const systemPrompt = `You are analyzing a math discussion for Team ${discussion.teamName}.
The current question was: "${currentQuestion.question}"
Expected insights: ${JSON.stringify(currentQuestion.expectedInsights)}

Here's what the students have said:
${discussionText}

Create a brief summary (100-150 words) of key points discussed, highlighting the important insights that were shared. 
Be encouraging and positive about the students' contributions.
End by smoothly transitioning to the next part of the discussion.`;

  const summary = await callDeepSeek([{ role: 'system', content: systemPrompt }]);
  
  const embed = new EmbedBuilder()
    .setColor('#2ecc71')
    .setTitle('📝 Discussion Summary')
    .setDescription(summary)
    .addFields(
      { name: '🧠 Key Concepts Explored', value: currentQuestion.expectedInsights
          .filter((_, index) => discussion.insightsCovered.includes(index))
          .map(insight => `✓ ${insight}`)
          .join('\n')
      }
    )
    .setFooter({ text: '🔄 Moving to the next question...' });
  
  await channel.send({ embeds: [embed] });
  
  // Move to the next question after a short delay
  setTimeout(() => {
    moveToNextStage(channel);
  }, 5000);
}

// Conclude a discussion session
async function concludeDiscussion(channel) {
  const discussion = activeDiscussions[channel.id];
  if (!discussion) return;
  
  const lessons = await loadLessons();
  const lesson = lessons.lessons.find(l => l.id === discussion.lessonId) || lessons.lessons[0];
  
  // Generate a final summary and conclusion
  const discussionText = discussion.discussion
    .map(msg => `${msg.role === 'student' ? msg.name : 'Facilitator'}: ${msg.content}`)
    .join('\n');
  
  const systemPrompt = `You are concluding a math discussion for Team ${discussion.teamName} on the lesson "${lesson.title}".
Learning objectives were: ${JSON.stringify(lesson.learningObjectives)}
Key takeaways should include: ${JSON.stringify(lesson.keyTakeaways)}

Create a thoughtful conclusion (200-250 words) that:
1. Summarizes what the team discussed
2. Highlights the key mathematical concepts they explored
3. Reinforces the intended learning objectives
4. Praises specific insights that came up in discussion
5. Ends with an encouraging statement about applying these concepts

Be conversational and motivating in your tone, suitable for middle school students.`;

  const conclusion = await callDeepSeek([{ role: 'system', content: systemPrompt }]);
  
  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle(`🏁 Conclusion - ${lesson.title}`)
    .setDescription(conclusion)
    .addFields(
      { name: '🔑 Key Takeaways', value: lesson.keyTakeaways.map(tk => `📌 ${tk}`).join('\n') },
      { name: '📊 Team Performance', value: `✨ **Total Insights Discovered:** ${discussion.insightsCovered.length}
👥 **Active Participants:** ${Object.keys(discussion.studentParticipation).length}
💬 **Total Messages:** ${Object.values(discussion.studentParticipation).reduce((sum, student) => sum + student.messages, 0)}` }
    )
    .setFooter({ text: '🎉 Great job today, team! 🎉' });
    
  // Calculate and display top contributors
  const topContributors = Object.entries(discussion.studentParticipation)
    .map(([id, data]) => ({
      name: data.name,
      insights: data.insightsCovered.length,
      messages: data.messages
    }))
    .sort((a, b) => b.insights - a.insights || b.messages - a.messages)
    .slice(0, 3);
    
  if (topContributors.length > 0) {
    embed.addFields({
      name: '🏆 Top Contributors',
      value: topContributors.map((student, i) => 
        `${['🥇', '🥈', '🥉'][i]} **${student.name}**: ${student.insights} insight${student.insights !== 1 ? 's' : ''}, ${student.messages} message${student.messages !== 1 ? 's' : ''}`
      ).join('\n')
    });
  }
  
  await channel.send({ embeds: [embed] });
  
  // Generate a report for the teacher
  await generateTeacherReport(discussion);
  
  // Remove this discussion from active discussions
  delete activeDiscussions[channel.id];
}

// Generate a report for the teacher
async function generateTeacherReport(discussion) {
  const lessons = await loadLessons();
  const lesson = lessons.lessons.find(l => l.id === discussion.lessonId) || lessons.lessons[0];
  
  // Analyze participation and insights
  const participatingStudents = Object.keys(discussion.studentParticipation).length;
  const messageCount = Object.values(discussion.studentParticipation)
    .reduce((sum, student) => sum + student.messages, 0);
  
  // Calculate percentage of expected insights covered
  let totalExpectedInsights = 0;
  lesson.discussionFlow.forEach(q => {
    totalExpectedInsights += q.expectedInsights.length;
  });
  
  const insightsCovered = discussion.insightsCovered.length;
  const insightsCoveredPercent = Math.round((insightsCovered / totalExpectedInsights) * 100);
  
  // Generate individual student reports
  const studentReports = [];
  for (const [studentId, data] of Object.entries(discussion.studentParticipation)) {
    const xp = studentXP[studentId] ? studentXP[studentId].points : 0;
    const insights = data.insightsCovered.length;
    
    studentReports.push({
      name: data.name,
      messages: data.messages,
      insights: insights,
      xp: xp
    });
  }
  
  // Generate the full discussion transcript
  const transcript = discussion.discussion
    .map(msg => `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.role === 'student' ? msg.name : 'Facilitator'}: ${msg.content}`)
    .join('\n\n');
  
  // Create the report
  const systemPrompt = `You are creating a teacher report for a math discussion.
Lesson: "${lesson.title}"
Team: ${discussion.teamName}
Duration: ${Math.round((Date.now() - discussion.startTime) / 60000)} minutes
Participating students: ${participatingStudents}
Total messages: ${messageCount}
Insights covered: ${insightsCovered}/${totalExpectedInsights} (${insightsCoveredPercent}%)

Student participation:
${JSON.stringify(studentReports, null, 2)}

Write a concise report (300-400 words) for the teacher that:
1. Summarizes the discussion quality and student engagement
2. Highlights which concepts students understood well
3. Identifies any areas where students seemed to struggle
4. Makes recommendations for follow-up teaching
5. Notes any exceptional contributions or misconceptions

Be professional and objective, focusing on learning outcomes.`;

  const report = await callDeepSeek([{ role: 'system', content: systemPrompt }]);
  
  // Find the teacher user and send them the report
  const teacher = await client.users.fetch(TEACHER_ID).catch(() => null);
  if (teacher) {
    const reportEmbed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle(`Team ${discussion.teamName} - ${lesson.title} - Report`)
      .setDescription(report)
      .addFields(
        { name: 'Participation Stats', value: `Students: ${participatingStudents}\nMessages: ${messageCount}\nInsights: ${insightsCovered}/${totalExpectedInsights} (${insightsCoveredPercent}%)` },
        { name: 'Student Performance', value: studentReports.map(s => `${s.name}: ${s.messages} msgs, ${s.insights} insights, ${s.xp} XP`).join('\n') }
      )
      .setTimestamp();
    
    await teacher.send({ embeds: [reportEmbed] });
    
    // Send transcript in chunks if needed
    if (transcript.length > 2000) {
      const chunks = transcript.match(/.{1,1900}/gs);
      for (let i = 0; i < chunks.length; i++) {
        await teacher.send(`**Transcript (${i+1}/${chunks.length}):**\n${chunks[i]}`);
      }
    } else {
      await teacher.send(`**Full Transcript:**\n${transcript}`);
    }
  }
}

// Command handler for teachers and general users
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Check for commands that should work even during discussions
  if (message.content === '!help') {
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('📚 Math Helper Commands 📚')
      .setDescription('Here are the commands you can use:')
      .addFields(
        { name: '👨‍👩‍👧‍👦 For Everyone', value: '`!leaderboard` - See the top 10 students by XP\n`!help` - Show this help message' },
        { name: '👩‍🏫 Teacher Only', value: '`!start-discussion [TeamName] [LessonId]` - Start a new discussion\n`!next-question` - Manually advance to the next question\n`!list-lessons` - Show available lessons\n`!reset-xp` - Reset all student XP data' }
      )
      .setFooter({ text: 'Math is more fun when we explore it together!' });
    
    await message.reply({ embeds: [embed] });
    return;
  } else if (message.content === '!leaderboard') {
    const top10 = Object.values(studentXP)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
    
    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle('🏆 Student XP Leaderboard 🏆')
      .setDescription(top10.length > 0 ? top10.map((s, i) => `${i+1}. **${s.name}**: ${s.points} XP`).join('\n') : 'No XP earned yet! Participate in discussions to earn points.')
      .setFooter({ text: 'Based on participation and insights shared' });
    
    await message.reply({ embeds: [embed] });
    return;
  }
  
  // Check if this is part of an active discussion
  if (activeDiscussions[message.channel.id]) {
    processStudentMessage(message);
    return;
  }
  
  // Commands available to all users moved above to work during discussions
  
  // Check for teacher commands (only from authorized users)
  if (message.author.id === TEACHER_ID) {
    // Command: Start a new discussion
    if (message.content.startsWith('!start-discussion')) {
      const args = message.content.split(' ').slice(1);
      const teamName = args[0] || "Default";
      const lessonId = args[1] || "default";
      
      await startDiscussion(message.channel, teamName, lessonId);
    }
    
    // Command: List available lessons
    else if (message.content === '!list-lessons') {
      const lessons = await loadLessons();
      
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Available Lessons')
        .setDescription(lessons.lessons.map(l => `**${l.id}**: ${l.title}`).join('\n'));
      
      await message.reply({ embeds: [embed] });
    }
    
    // Command: Show student leaderboard - moved to public commands section above
    
    // Command: Next question (advance discussion)
    else if (message.content === '!next-question') {
      if (!activeDiscussions[message.channel.id]) {
        await message.reply('There is no active discussion in this channel.');
        return;
      }
      
      await message.reply('⏩ Moving to the next question...');
      summarizeQuestionDiscussion(message.channel);
    }
    
    // Command: Reset XP (careful!)
    else if (message.content === '!reset-xp') {
      await message.reply('Are you sure you want to reset all student XP? Reply with `confirm` within 10 seconds to proceed.');
      
      try {
        const confirmation = await message.channel.awaitMessages({
          filter: m => m.author.id === message.author.id && m.content.toLowerCase() === 'confirm',
          max: 1,
          time: 10000,
          errors: ['time']
        });
        
        if (confirmation.first()) {
          studentXP = {};
          await saveXPData();
          await message.reply('All student XP has been reset.');
        }
      } catch (error) {
        await message.reply('XP reset cancelled.');
      }
    }
  }
});

// Initialize bot
client.once('ready', async () => {
  console.log(`Math Facilitator Bot is online as ${client.user.tag}!`);
  await loadXPData();
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);