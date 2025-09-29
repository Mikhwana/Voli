// server.js

import express from 'express';
import expressWs from 'express-ws';
import { GoogleGenAI } from '@google/genai';

const { app, getWss } = expressWs(express());
const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // Serve static files from the 'public' directory

// --- Your existing AI code ---
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const tools = [
  { urlContext: {} },
  { googleSearch: {} },
];

const config = {
  temperature: 0.85,
  topP: 0.85,
  thinkingConfig: {
    thinkingBudget: -1,
  },
  tools,
  systemInstruction: [
    {
      text: `You are Voli, deprived of "Volition". Your job is as an assistant to help people with their mental state. In advance, I'd like you to specialize in mental health. Remember that some people don't share their story to get "help", but instead they just want to lift the burden off their heads. So at first, instead of offering to help, I'd like you to ask them how they are doing, listen to their confession, and justify it IF it was right. But if it was wrong, don't try to correct them right away, just listen to them first, while trying to question about what they're sharing with you. And then, slowly encourage them about their problem, help them to be seen, and validate their feelings. I want you to imitate the Volition skill from Disco Elysium. And if needed, I want you to be hard on them, be aggressive but in a good way. Use sarcasm if needed to reverse their pain and their mental state. REMEMBER, BE AGGRESSIVE IF NEEDED! So at first start soft and kind, with less sarcasm and be more like Volition.`,
    },
  ],
};

const model = 'gemini-2.5-pro';

// --- WebSocket endpoint for AI interaction ---
app.ws('/chat', async (ws, req) => {
  // 1. INITIALIZE HISTORY: Start with the system instruction
  let history = [
    {
      // The system instruction is conceptually the first 'model' message, 
      // but in the history array, the first turn must be the user's. 
      // We will prime the history on the first message.
    }
  ];
  
  let isFirstMessage = true;

  ws.on('message', async (msg) => {
    const userMessage = msg.toString();
    console.log('Received message:', userMessage);

    // 2. BUILD CONTENTS: Add the new user message to the history
    const newMessage = {
        role: 'user',
        parts: [{ text: userMessage }],
    };
    
    // For the first message, we send only the user message and config
    // The history will be populated after the first full exchange.

    if (isFirstMessage) {
        history = [newMessage]; // Start history with the first user message
        isFirstMessage = false;
    } else {
        history.push(newMessage); // Append the latest user message
    }
    
    // We send the entire history as the contents array
    const contents = history; 

    try {
      const response = await ai.models.generateContentStream({
        model,
        config,
        contents, // Sending the full history
      });

      let fullResponseText = '';

      for await (const chunk of response) {
        if (chunk.text) {
          fullResponseText += chunk.text;
          ws.send(chunk.text); // Stream each chunk of the response to the client
        }
      }
      
      // 3. STORE HISTORY: After the full response is received, add it to the history
      history.push({
        role: 'model',
        parts: [{ text: fullResponseText }],
      });
      
    } catch (error) {
      console.error('Error generating content:', error);
      ws.send('Error: Could not get a response from the AI.');
    }
  });

  // Optional: Clear history when the connection closes to free memory
  ws.on('close', () => {
      console.log('WebSocket connection closed.');
      // In a real multi-user app, you might clear history based on a unique user ID, 
      // but here the history is local to the ws instance.
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});