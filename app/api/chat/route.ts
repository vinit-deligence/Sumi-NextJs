import { NextRequest, NextResponse } from "next/server";
import { extractContactsWithLLM } from "@/app/utils/contactExtractor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, userId = "anonymous", timezone = "UTC" } = body;

    console.log("Received message:", message);

    // Extract structured contact information using LLM
    const extractionResult = await extractContactsWithLLM(
      message,
      timezone,
      userId
    );

    // Return structured JSON response with extracted data
    return NextResponse.json({
      success: true,
      message: "Contact information extracted successfully",
      data: extractionResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to process request",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
