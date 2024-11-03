import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is missing');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function verifyWithGPT(commitment, extractedText, imageUrl) {
  try {
    const messages = [
      {
        role: "system",
        content: "You are a commitment verification assistant. Analyze the provided image and text to determine if it constitutes valid proof of the commitment. Respond ONLY with a JSON object containing 'isValid' (boolean), 'explanation' (string), and 'confidence' (string: 'high', 'medium', or 'low'). Be supportive and practical in verification, accepting reasonable proof like gym photos for workouts or timer screenshots for time-based tasks."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Please verify this commitment: "${commitment}"\n\nExtracted text from image: "${extractedText}"\n\nAnalyze the image and determine if it shows reasonable proof of the commitment being completed.`
          },
          {
            type: "image_url",
            image_url: imageUrl
          }
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "text" }
    });

    const content = response.choices[0].message.content.trim();
    
    // Try to extract JSON from the response if it's not already valid JSON
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    try {
      const analysis = JSON.parse(jsonStr);
      
      // Validate and sanitize the response
      return {
        isValid: Boolean(analysis.isValid),
        explanation: String(analysis.explanation || "No explanation provided"),
        confidence: ['high', 'medium', 'low'].includes(analysis.confidence) ? 
          analysis.confidence : 'medium'
      };
    } catch (parseError) {
      console.error('GPT response parsing error:', parseError);
      console.error('Raw response:', content);
      
      // Fallback response if parsing fails
      return {
        isValid: false,
        explanation: "Unable to verify proof due to technical issues with the analysis",
        confidence: "low"
      };
    }
  } catch (error) {
    console.error('GPT verification error:', error);
    throw new Error('Failed to verify proof with GPT');
  }
}