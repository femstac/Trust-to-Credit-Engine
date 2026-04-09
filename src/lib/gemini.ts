import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const getNudgeAdvice = async (userProfile: any, transactions: any[]) => {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    You are a helpful financial assistant for a small vendor in West Africa.
    User Profile: ${JSON.stringify(userProfile)}
    Recent Transactions: ${JSON.stringify(transactions.slice(0, 10))}
    
    Based on their transaction patterns, provide a short, encouraging "Nudge" (max 2 sentences).
    If they had a high revenue day, suggest moving a small amount to savings.
    If they are spending too quickly, suggest a "Rainy Day" fund.
    Make it feel human, contextual, and culturally relevant (use local currency like GHS, NGN, etc. if applicable).
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: "You are a Trust-to-Credit financial coach. Your goal is to help informal sector workers build their creditworthiness through behavioral nudges.",
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Keep up the good work! Consistent deposits help build your Trust Score.";
  }
};
