import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prompt = process.argv.slice(2).join(" ");
if (!prompt) { console.log("Please provide a prompt!"); process.exit(1); }

const response = await openai.chat.completions.create({
  model: "gpt-4o", // or "gpt-3.5-turbo"
  messages: [{ role: "user", content: prompt }],
});

console.log("\nAI Response:\n", response.choices[0].message.content);