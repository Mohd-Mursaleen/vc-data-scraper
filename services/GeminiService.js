const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-09-2025",
    });

    // Configure Google Search grounding tool for Gemini 2.0
    // Google Search is built into Gemini, no separate API key needed
    console.log("🔎 Google Search grounding enabled for GeminiService");
  }

  /**
   * Helper to retry operations with exponential backoff
   */
  async retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
    let retries = 0;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (
          (error.message.includes("429") ||
            error.message.includes("503") ||
            error.message.includes("Too Many Requests") ||
            error.message.includes("Service Unavailable") ||
            error.message.includes("overloaded") ||
            error.message.includes("Resource exhausted")) &&
          retries < maxRetries
        ) {
          retries++;
          const delay = initialDelay * Math.pow(2, retries - 1);
          console.log(
            `⚠️  Gemini API error (${error.status || 'unknown'}). Retrying in ${delay}ms (Attempt ${retries}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Centralized helper to call model.generateContent and automatically attach tools
   * Accepts either a string (contents) or an options object { contents, ... }
   * Returns the generated text directly.
   */
  async generateContent(prompt) {
    return this.retryWithBackoff(async () => {
      const result = await this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        tools: [
          {
            googleSearch: {}, // Gemini 2.0 uses googleSearch instead of googleSearchRetrieval
          },
        ],
      });
      const response = await result.response;
      return response.text();
    });
  }

  /**
   * Generate structured JSON output using Gemini's response schema
   * @param {string} prompt - Text prompt
   * @param {Object} schema - JSON schema for structured output
   * @param {Array} images - Optional array of image objects with base64 data
   */
  async generateStructuredOutput(prompt, schema, images = null, tools = []) {
    return this.retryWithBackoff(async () => {
      try {
        // Build parts array starting with text prompt
        const parts = [{ text: prompt }];

        // Add images if provided
        if (images && images.length > 0) {
          console.log(`   🖼️  Including ${images.length} image(s) in prompt`);

          for (const image of images) {
            parts.push({
              inlineData: {
                mimeType: "image/png",
                data: image.base64,
              },
            });
          }
        }

        const result = await this.model.generateContent({
          contents: [
            {
              role: "user",
              parts: parts,
            },
          ],
          tools: tools,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });

        const response = result.response;
        const jsonText = response.text();

        try {
          // Clean and parse JSON
          const cleanedJsonText = this.cleanJson(jsonText);
          return JSON.parse(cleanedJsonText);
        } catch (parseError) {
          console.error("❌ JSON Parse Error. Raw text length:", jsonText.length);
          const fs = require('fs');
          fs.writeFileSync('debug_gemini_response.txt', jsonText);
          console.error("❌ Raw text saved to debug_gemini_response.txt");
          throw parseError;
        }
      } catch (error) {
        console.error("❌ Structured output generation failed:", error);
        throw error; // Re-throw for retry logic to catch
      }
    });
  }

  /**
   * Helper to clean JSON string from markdown and potential bad characters
   */
  cleanJson(text) {
    // Remove markdown code blocks if present
    let clean = text.replace(/```json\n?|\n?```/g, "").trim();
    return clean;
  }
}

module.exports = GeminiService;
