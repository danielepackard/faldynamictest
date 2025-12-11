import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

// Configure fal client
fal.config({
  credentials: process.env.FAL_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Create D&D style prompt
    const enhancedPrompt = `Fantasy RPG illustration, Dungeons & Dragons style, mystical atmosphere, detailed digital painting, dramatic lighting, epic scene: ${prompt}`;

    // Use FLUX Schnell - fastest model (~1-2 seconds)
    console.log("Generating image with prompt:", enhancedPrompt.slice(0, 100) + "...");
    
    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: enhancedPrompt,
        image_size: "landscape_16_9",
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      },
    });

    console.log("Fal.ai result:", JSON.stringify(result, null, 2));

    // Extract image URL from result - cast to access nested properties
    const resultData = result as { data?: { images?: { url: string }[] }; images?: { url: string }[] };
    const imageUrl = 
      resultData?.data?.images?.[0]?.url || 
      resultData?.images?.[0]?.url;

    if (!imageUrl) {
      console.error("No image URL found in result:", result);
      return NextResponse.json(
        { error: "No image generated", result },
        { status: 500 }
      );
    }

    console.log("Generated image URL:", imageUrl);
    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Error generating image:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}

