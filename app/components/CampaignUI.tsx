"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Conversation } from "@11labs/client";

interface DialogueMessage {
  speaker: "Dungeon Master" | "Team";
  text: string;
  timestamp: number;
}

export default function CampaignUI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationRef = useRef<Conversation | null>(null);
  const dialogueRef = useRef<DialogueMessage[]>([]);
  const lastImageTimeRef = useRef<number>(0);
  const imageIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const firstImageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dialogueContainerRef = useRef<HTMLDivElement>(null);

  // Keep dialogueRef in sync with dialogue state
  useEffect(() => {
    dialogueRef.current = dialogue;
  }, [dialogue]);

  // Auto-scroll dialogue to bottom
  useEffect(() => {
    if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [dialogue]);

  const generateImage = useCallback(async (recentOnly: boolean = false) => {
    const messages = dialogueRef.current;
    console.log(`[Image Gen] Starting generation, recentOnly=${recentOnly}, messages count=${messages.length}`);
    
    if (messages.length === 0) {
      console.log("[Image Gen] No messages yet, skipping");
      return;
    }

    let textForPrompt: string;

    if (recentOnly) {
      // Get messages from the last 8 seconds
      const cutoffTime = Date.now() - 8000;
      const recentMessages = messages.filter((m) => m.timestamp > cutoffTime);
      if (recentMessages.length === 0) {
        console.log("[Image Gen] No recent messages in last 8s, skipping");
        return;
      }
      textForPrompt = recentMessages.map((m) => m.text).join(" ");
    } else {
      // Use all dialogue so far
      textForPrompt = messages.map((m) => m.text).join(" ");
    }

    // Truncate to reasonable length for prompt
    if (textForPrompt.length > 500) {
      textForPrompt = textForPrompt.slice(-500);
    }

    console.log("[Image Gen] Prompt text:", textForPrompt.slice(0, 100) + "...");
    setIsGeneratingImage(true);

    try {
      const response = await fetch("/api/fal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: textForPrompt }),
      });

      const data = await response.json();
      console.log("[Image Gen] Response:", data);
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate image");
      }

      if (data.imageUrl) {
        console.log("[Image Gen] Setting new image:", data.imageUrl);
        setCurrentImage(data.imageUrl);
      }
    } catch (err) {
      console.error("[Image Gen] Error:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  }, []);

  const startImageGeneration = useCallback(() => {
    console.log("[Image Gen] Starting image generation cycle");
    
    // Generate first image after 8 seconds with all context
    firstImageTimeoutRef.current = setTimeout(() => {
      console.log("[Image Gen] First timeout triggered");
      generateImage(false);
      lastImageTimeRef.current = Date.now();

      // Then generate every 8 seconds with recent context only
      imageIntervalRef.current = setInterval(() => {
        console.log("[Image Gen] Interval triggered");
        generateImage(true);
        lastImageTimeRef.current = Date.now();
      }, 8000);
    }, 8000);
  }, [generateImage]);

  const startConversation = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Get signed URL from our API
      const response = await fetch("/api/elevenlabs/signed-url");
      if (!response.ok) {
        throw new Error("Failed to get signed URL");
      }
      const { signedUrl } = await response.json();

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start the conversation
      const conversation = await Conversation.startSession({
        signedUrl,
        onConnect: () => {
          console.log("Connected to ElevenLabs");
          setIsConnected(true);
          setIsConnecting(false);
          // Start the image generation cycle
          startImageGeneration();
        },
        onDisconnect: () => {
          console.log("Disconnected from ElevenLabs");
          setIsConnected(false);
          setIsConnecting(false);
          // Stop image generation
          if (imageIntervalRef.current) {
            clearInterval(imageIntervalRef.current);
          }
        },
        onError: (err) => {
          console.error("Conversation error:", err);
          setError("Connection error occurred");
          setIsConnecting(false);
        },
        onModeChange: (mode) => {
          setIsSpeaking(mode.mode === "speaking");
        },
        onMessage: ({ message, source }) => {
          // source is "user" or "ai"
          console.log(`Message from ${source}:`, message);
          const speaker = source === "ai" ? "Dungeon Master" : "Team";
          
          setDialogue((prev) => [
            ...prev,
            {
              speaker,
              text: message,
              timestamp: Date.now(),
            },
          ]);
        },
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error("Failed to start conversation:", err);
      setError(err instanceof Error ? err.message : "Failed to start conversation");
      setIsConnecting(false);
    }
  };

  const endConversation = async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession();
      conversationRef.current = null;
    }
    if (firstImageTimeoutRef.current) {
      clearTimeout(firstImageTimeoutRef.current);
    }
    if (imageIntervalRef.current) {
      clearInterval(imageIntervalRef.current);
    }
    setIsConnected(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (conversationRef.current) {
        conversationRef.current.endSession();
      }
      if (firstImageTimeoutRef.current) {
        clearTimeout(firstImageTimeoutRef.current);
      }
      if (imageIntervalRef.current) {
        clearInterval(imageIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="campaign-container">
      {/* Image Display Area */}
      <div className="image-area">
        {currentImage ? (
          <img
            src={currentImage}
            alt="D&D Scene"
            className="generated-image"
          />
        ) : (
          <div className="image-placeholder">
            <div className="placeholder-content">
              <div className="dragon-icon">🐉</div>
              <p>Your adventure awaits...</p>
              <p className="subtitle">Images will appear here as your story unfolds</p>
            </div>
          </div>
        )}
        {isGeneratingImage && (
          <div className="generating-overlay">
            <div className="generating-spinner"></div>
            <span>Conjuring vision...</span>
          </div>
        )}
      </div>

      {/* Start Campaign Button */}
      <div className="button-area">
        {!isConnected ? (
          <button
            onClick={startConversation}
            disabled={isConnecting}
            className="campaign-button"
          >
            {isConnecting ? (
              <>
                <span className="button-spinner"></span>
                Summoning...
              </>
            ) : (
              <>
                <span className="dice-icon">🎲</span>
                Start Campaign
              </>
            )}
          </button>
        ) : (
          <button
            onClick={endConversation}
            className="campaign-button end-button"
          >
            <span className="skull-icon">💀</span>
            End Campaign
          </button>
        )}
        
        {error && <p className="error-message">{error}</p>}
        
        {isConnected && (
          <div className="status-indicator">
            <span className={`status-dot ${isSpeaking ? "speaking" : "listening"}`}></span>
            {isSpeaking ? "Dungeon Master is speaking..." : "Listening to the party..."}
          </div>
        )}
      </div>

      {/* Dialogue Box */}
      <div className="dialogue-area">
        <div className="dialogue-header">
          <span className="scroll-icon">📜</span>
          <h2>Chronicle of Events</h2>
        </div>
        <div className="dialogue-container" ref={dialogueContainerRef}>
          {dialogue.length === 0 ? (
            <div className="dialogue-empty">
              <p>The story has yet to begin...</p>
            </div>
          ) : (
            dialogue.map((msg, index) => (
              <div
                key={index}
                className={`dialogue-message ${
                  msg.speaker === "Dungeon Master" ? "dm-message" : "team-message"
                }`}
              >
                <span className="speaker-name">{msg.speaker}:</span>
                <span className="message-text">{msg.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

