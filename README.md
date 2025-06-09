# Math Facilitator Bot

A Discord bot designed to facilitate structured math discussions for middle school students. The bot guides students through math lessons, asks thought-provoking questions, and awards XP for participation and insights.

## Features

- **Guided Math Discussions**: Structured lessons with sequential questions to guide mathematical thinking
- **XP System**: Awards points for participation and meaningful insights
- **AI-Powered Responses**: Uses DeepSeek API to generate contextually relevant responses to students
- **Teacher Reports**: Generates summaries and reports for educators to track student progress
- **Discussion Management**: Tracks insights, participation, and guides students to key learning objectives

## Technical Overview

The bot is built using:

- Node.js
- Discord.js for Discord integration
- DeepSeek API for AI-powered responses
- File-based storage for lessons and student progress

## Commands

### For Everyone
- `!leaderboard` - See the top 10 students by XP
- `!help` - Show commands and usage help

### For Teachers Only
- `!start-discussion [TeamName] [LessonId]` - Start a new discussion
- `!next-question` - Manually advance to the next question
- `!list-lessons` - Show available lessons
- `!reset-xp` - Reset all student XP data

## Setup

1. Clone this repository
2. Create a `.env` file with the following variables:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   DEEPSEEK_API_KEY=your_deepseek_api_key
   ```
3. Install dependencies using `npm install`
4. Start the bot using `node index.js`

## Lesson Structure

Lessons are stored in `lessons.json` with the following structure:

- **id**: Unique identifier for the lesson
- **title**: Lesson title
- **description**: Brief description of the lesson
- **learningObjectives**: Array of learning goals
- **discussionFlow**: Array of question objects with:
  - **question**: The main discussion question
  - **expectedInsights**: Key insights students should discover
  - **followupQuestions**: Additional questions to guide discussion
- **keyTakeaways**: Main concepts to reinforce at conclusion

## XP System

- **+10 XP** for each mathematical insight shared
- **+2 XP** for active participation

## License

ISC
