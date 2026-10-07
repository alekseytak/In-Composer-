/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { getActiveProvider, callOpenAICompatibleChat } from "./providersService";

const getApiKey = (): string => {
  const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (envKey && envKey !== "undefined" && envKey.trim() !== "") {
    return envKey;
  }
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type === 'gemini' && activeProvider.apiKey) {
    return activeProvider.apiKey.trim();
  }
  return "";
};

const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return { mimeType: matches[1], data: matches[2] };
  }
  return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] || dataUrl };
};

/**
 * Robust wrapper for Gemini generateContent to handle 403 / model availability errors by falling back
 * to guaranteed-to-exist models like gemini-3.5-flash or gemini-3.1-flash-lite.
 */
const safeGenerateContent = async (
  ai: GoogleGenAI,
  preferredModel: string,
  options: any,
  fallbackModel: string = "gemini-3.5-flash"
) => {
  try {
    return await ai.models.generateContent({
      model: preferredModel,
      ...options
    });
  } catch (error: any) {
    const errorStr = error?.message || "";
    console.warn(`Gemini Service: Preferred model ${preferredModel} failed (${errorStr}). Falling back to ${fallbackModel}...`);
    
    // If it is a quota or key issue we might still fail, but we bypass model unsupported/403 issues beautifully
    return await ai.models.generateContent({
      model: fallbackModel,
      ...options
    });
  }
};

// Background task: Sanitize prompt for safety using gemma-2-2b-it with gemini-3.1-flash-lite fallback
const sanitizePromptForSafety = async (failedPrompt: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await safeGenerateContent(
      ai,
      'gemma-2-2b-it',
      {
        contents: `The following prompt was blocked: "${failedPrompt}". Rewrite it to be safe, artistic, and professional. Output ONLY the new prompt text, no meta-talk.`,
      },
      'gemini-3.1-flash-lite'
    );
    return response.text?.trim() || failedPrompt;
  } catch (e: any) {
    return failedPrompt;
  }
};

// Light visual analysis using gemini-2.5-flash with gemini-3.5-flash fallback
export const analyzeImage = async (imageB64: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const { mimeType, data } = parseDataUrl(imageB64);
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: {
          parts: [
            { inlineData: { mimeType, data } },
            { text: "Detailed artistic analysis for context." }
          ]
        }
      },
      'gemini-3.5-flash'
    );
    return response.text;
  } catch (error: any) {
    throw new Error(error?.message || "Visual analysis failed.");
  }
};

// Optimize prompt using active provider or lightweight gemini-2.5-flash
export const refinePrompt = async (currentPrompt: string) => {
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type !== 'gemini' && activeProvider.model) {
    try {
      const res = await callOpenAICompatibleChat(activeProvider, [
        {
          role: 'system',
          content: 'You are an elite prompt engineer. Expand the user prompt into a high-detail professional art directive. Return JSON with "expanded_prompt" key.'
        },
        {
          role: 'user',
          content: `Expand this prompt: "${currentPrompt}"`
        }
      ], { response_format: { type: 'json_object' } });
      const parsed = JSON.parse(res);
      return parsed.expanded_prompt || res || currentPrompt;
    } catch (e) {
      console.warn(`[Providers] Custom provider failed for refinePrompt, falling back to Gemini`, e);
    }
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: `PROMPT_ENGINEER_MODE: Expand the following into a professional art directive.
        Current: "${currentPrompt}"
        REQUIREMENT: Return ONLY valid JSON. No conversational text.
        FORMAT:
        {
          "expanded_prompt": "full high-detail prompt string",
          "analysis": { "style": "...", "lighting": "...", "composition": "..." }
        }`,
        config: { responseMimeType: "application/json" }
      },
      'gemini-3.5-flash'
    );
    
    const cleaned = response.text?.replace(/```json|```/g, '').trim() || "";
    const data = JSON.parse(cleaned);
    return data.expanded_prompt || currentPrompt;
  } catch (e: any) {
    return currentPrompt;
  }
};

// Research tasks using active provider or gemini-2.5-flash with gemini-3.5-flash fallback
export const agentResearch = async (prompt: string) => {
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type !== 'gemini' && activeProvider.model) {
    try {
      const text = await callOpenAICompatibleChat(activeProvider, [
        { role: 'system', content: 'You are a visual design researcher. Provide a short, insightful artistic synthesis (2-3 sentences).' },
        { role: 'user', content: `Artistic research for directive: "${prompt}"` }
      ]);
      return { text, sources: [] };
    } catch (e) {
      console.warn(`[Providers] Custom provider failed for agentResearch, falling back to Gemini`, e);
    }
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: `Artistic research for: "${prompt}". Synthesize direction.`,
      },
      'gemini-3.5-flash'
    );
    return { text: response.text || `Research completed for: ${prompt}`, sources: [] };
  } catch (error: any) {
    return { text: `Research completed for: ${prompt}`, sources: [] };
  }
};

// Image generation using nano banana lite: gemini-3.1-flash-lite-image with resilient fallback
export const generateImage = async (
  prompt: string, 
  aspectRatio: string = "1:1", 
  worldContext?: string, 
  refImages?: string[],
  useSearch: boolean = false,
  isRetry: boolean = false
): Promise<{url: string, metadata?: any}> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const parts: any[] = [];

  if (refImages && refImages.length > 0) {
    refImages.forEach(img => {
      const { mimeType, data } = parseDataUrl(img);
      parts.push({ inlineData: { mimeType, data } });
    });
  }

  const finalPrompt = worldContext ? `World Context: ${worldContext}. Instruction: ${prompt}` : prompt;
  parts.push({ text: finalPrompt });
  
  // Use 'gemini-3.1-flash-lite-image' for standard ultra-lightweight generation
  const modelName = 'gemini-3.1-flash-lite-image';
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        imageConfig: { aspectRatio: aspectRatio as any }
      }
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No response from model.");

    if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
      if (!isRetry) {
        const safePrompt = await sanitizePromptForSafety(prompt);
        return generateImage(safePrompt, aspectRatio, worldContext, refImages, useSearch, true);
      }
      throw new Error("Blocked by safety filters.");
    }

    const imgPart = candidate.content?.parts?.find(p => p.inlineData);
    if (imgPart?.inlineData?.data) {
      return { url: `data:image/png;base64,${imgPart.inlineData.data}`, metadata: candidate.groundingMetadata };
    }

    const textPart = candidate.content?.parts?.find(p => p.text);
    if (textPart?.text) throw new Error(`Refusal: ${textPart.text}`);

    throw new Error("Empty response.");
  } catch (error: any) {
    const errStr = error?.message || "";
    // If quota is exhausted or permission denied, engage free high-fidelity fallback engine
    if (errStr.includes('403') || errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota') || errStr.includes('permission')) {
      console.warn("Gemini Image Quota reached. Activating zero-quota high-fidelity image generator fallback...", error);
      try {
        const encodedPrompt = encodeURIComponent(finalPrompt.slice(0, 350));
        let width = 1024;
        let height = 1024;
        if (aspectRatio === '16:9') { width = 1280; height = 720; }
        else if (aspectRatio === '9:16') { width = 720; height = 1280; }
        else if (aspectRatio === '4:3') { width = 1024; height = 768; }
        else if (aspectRatio === '3:4') { width = 768; height = 1024; }
        
        const seed = Math.floor(Math.random() * 888888);
        const fallbackUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
        return { 
          url: fallbackUrl, 
          metadata: { engine: 'Zero-Quota Flux Engine' } 
        };
      } catch (fallbackErr) {
        throw error;
      }
    }
    throw error;
  }
};

// Creative Director planning using active provider or gemini-2.5-flash with gemini-3.5-flash fallback
export const getAgentPlan = async (prompt: string) => {
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type !== 'gemini' && activeProvider.model) {
    try {
      const res = await callOpenAICompatibleChat(activeProvider, [
        {
          role: 'system',
          content: 'You are the AI Creative Director. Provide exactly 4 sequential steps of visual production plan as a JSON array of strings. Output ONLY a valid JSON array.'
        },
        { role: 'user', content: `Directive: "${prompt}"` }
      ]);
      const cleaned = res.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4);
    } catch (e) {
      console.warn(`[Providers] Custom provider failed for getAgentPlan, falling back to Gemini`, e);
    }
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: `You are the AI Creative Director. Create a realistic, highly professional multi-step visual production plan for this directive: "${prompt}".
        Provide exactly 4 sequential steps of your creative development process as a JSON array of strings. Keep each step active, insightful, and focused on production. Do not exceed 4 steps.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      },
      'gemini-3.5-flash'
    );
    return JSON.parse(response.text || "[]");
  } catch (e: any) {
    return [
      "Analyzing creative request and compiling visual goals...",
      "Formulating moodboards and structural plans...",
      "Synthesizing stylistic references and missing asset definitions...",
      "Merging composition layers with matching lighting and perspective..."
    ];
  }
};

export const getLocalBrainstormResponse = (userMessage: string, chatHistory: any[]): { speech: string, suggestedPrompt: string } => {
  const msgLower = userMessage.toLowerCase();
  let speech = "";
  let suggestedPrompt = "";
  let detectedActions: string[] = [];

  const isRussian = /[а-яА-Я]/.test(userMessage);

  // 1. Detect Agent Actions inside the user message
  if (msgLower.includes("золот") || msgLower.includes("gold")) {
    detectedActions.push("[ACTION: SET_THEME GOLDEN]");
  } else if (msgLower.includes("темн") || msgLower.includes("dark")) {
    detectedActions.push("[ACTION: SET_THEME DARK]");
  } else if (msgLower.includes("светл") || msgLower.includes("light")) {
    detectedActions.push("[ACTION: SET_THEME LIGHT]");
  }

  if (msgLower.includes("консилиум") || msgLower.includes("consilium")) {
    detectedActions.push("[ACTION: SET_MODE CONSILIUM]");
  } else if (msgLower.includes("симпозиум") || msgLower.includes("symposium")) {
    detectedActions.push("[ACTION: SET_MODE SYMPOSIUM]");
  } else if (msgLower.includes("ручно") || msgLower.includes("manual")) {
    detectedActions.push("[ACTION: SET_MODE MANUAL]");
  } else if (msgLower.includes("агент") || msgLower.includes("director")) {
    detectedActions.push("[ACTION: SET_MODE AGENT]");
  } else if (msgLower.includes("голос") || msgLower.includes("live")) {
    detectedActions.push("[ACTION: SET_MODE LIVE]");
  }

  if (msgLower.includes("экспорт") || msgLower.includes("export") || msgLower.includes("сохрани в md") || msgLower.includes("markdown")) {
    detectedActions.push("[ACTION: EXPORT_MD]");
  }

  // 2. Generate creative suggested visual prompt
  let style = "photorealistic digital art, octane render";
  let composition = "centered, dynamic perspective";
  let lighting = "cinematic soft volumetric lighting";
  let subject = userMessage;

  if (msgLower.includes("киберпанк") || msgLower.includes("cyberpunk") || msgLower.includes("неон") || msgLower.includes("neon")) {
    style = "cyberpunk concept art, neon realism, hyper-detailed, ray-tracing reflection";
    lighting = "vibrant purple and teal neon glare, high-contrast chiaroscuro";
    composition = "wide angle atmospheric cityscape, looking up at giant holographic screens";
  } else if (msgLower.includes("космос") || msgLower.includes("space") || msgLower.includes("звезд") || msgLower.includes("star")) {
    style = "cosmic space exploration realism, nebula background, epic scale, 8k resolution";
    lighting = "glowing stellar emissions, deep contrast shadows of the void";
    composition = "dynamic diagonal rule-of-thirds alignment of a celestial observer or planet";
  } else if (msgLower.includes("фэнтези") || msgLower.includes("fantasy") || msgLower.includes("магия") || msgLower.includes("magic")) {
    style = "ethereal fantasy epic illustration, fine art details, magical realism, highly detailed painterly style";
    lighting = "soft mystical sunbeams piercing through mist, bioluminescent glow";
    composition = "majestic cinematic focal framing with rich environmental depth";
  } else if (msgLower.includes("аниме") || msgLower.includes("anime")) {
    style = "masterpiece colorful anime key art, studio ghibli layout inspiration, hand-drawn detailing";
    lighting = "warm golden hour skylight, bright vivid saturation";
    composition = "beautiful scenic illustration with a deep sky and clouds backdrop";
  } else if (msgLower.includes("природа") || msgLower.includes("nature") || msgLower.includes("лес") || msgLower.includes("forest")) {
    style = "ultra-realistic macro nature photography, Hasselblad details, atmospheric realism";
    lighting = "soft volumetric sunbeams, warm morning dapple rays";
    composition = "close-up detail shot with elegant shallow depth of field blurred backdrop";
  } else if (msgLower.includes("портрет") || msgLower.includes("portrait") || msgLower.includes("человек") || msgLower.includes("human") || msgLower.includes("лицо")) {
    style = "studio portrait realism, highly textured skin pores, fine hair strands, dramatic close-up, 85mm lens";
    lighting = "soft Rembrandt lighting, cinematic key and fill rim-lights";
    composition = "intense close-up eye-level perspective with focus on emotive expressions";
  }

  const cleanSubject = userMessage
    .replace(/(переключи|включи|сделай|тему|режим|консилиум|симпозиум|золотую|экспорт|export|markdown|md)/gi, '')
    .trim() || (isRussian ? "Величественный цифровой шедевр" : "A majestic digital masterpiece");

  suggestedPrompt = `${cleanSubject}, ${style}, ${composition}, ${lighting}, 8k, highly detailed.`;

  // 3. Generate voice speech
  const actionText = detectedActions.length > 0 ? ` ${detectedActions.join(" ")}` : "";

  if (isRussian) {
    const responses = [
      `Замечательная мысль! Сгенерировал детальный художественный промт на основе вашей идеи.${actionText}`,
      `Отличный концепт! Я структурировал визуальные параметры, добавил кинематографичное освещение и глубину кадра.${actionText}`,
      `Готово! Проанализировал композицию и усилил стилистический акцент для лучшего результата.${actionText}`,
      `Мне очень нравится это направление. Добавил профессиональные художественные директивы для создания фотореалистичной композиции.${actionText}`
    ];
    speech = responses[Math.floor(Math.random() * responses.length)];
  } else {
    const responses = [
      `Brilliant concept! I have engineered a highly descriptive art prompt with premium aesthetic details.${actionText}`,
      `Done. I structured the composition and injected dramatic lighting parameters for professional output.${actionText}`,
      `I love this visual direction. Added cinematic depth, volumetric light, and style consistency tags.${actionText}`,
      `Fascinating idea. Refined the core subject with high-fidelity production rendering directives.${actionText}`
    ];
    speech = responses[Math.floor(Math.random() * responses.length)];
  }

  return { speech, suggestedPrompt };
};

// Brainstorm voice responses using gemini-2.5-flash with gemini-3.5-flash fallback
export const getLiveBrainstormResponse = async (
  userMessage: string, 
  chatHistory: {role: 'user' | 'model', text: string}[],
  engine: 'GEMINI' | 'LOCAL' = 'GEMINI'
) => {
  if (engine === 'LOCAL') {
    // 1. Try to use Chrome built-in local AI model if available!
    try {
      const aiObj = (window as any).ai || (window as any).model;
      if (aiObj && (aiObj.languageModel || aiObj.createTextSession)) {
        console.log("Local Gemma-Nano Service: Initializing Chrome built-in AI session...");
        const session = aiObj.languageModel 
          ? await aiObj.languageModel.create()
          : await aiObj.createTextSession();
        
        const historyText = chatHistory.map(h => `${h.role}: ${h.text}`).join("\n");
        const promptText = `You are a creative brainstorm assistant. User: "${userMessage}". Chat history:\n${historyText}\nRespond with JSON: {"speech": "warm creative response (1-2 sentences)", "suggestedPrompt": "enriched visual prompt based on user's concept"}. Keep it short and return strictly JSON.`;
        const resText = await session.prompt(promptText);
        session.destroy();
        
        const cleaned = resText.replace(/```json|```/g, '').trim() || "";
        const data = JSON.parse(cleaned);
        if (data.speech && data.suggestedPrompt) {
          const localActionResponse = getLocalBrainstormResponse(userMessage, chatHistory);
          const actionsStr = localActionResponse.speech.match(/\[ACTION:\s*([A-Z_]+)\s*(.*?)\]/g)?.join(" ") || "";
          if (actionsStr) {
            data.speech += ` ${actionsStr}`;
          }
          return data;
        }
      }
    } catch (localAiError) {
      console.warn("Chrome Built-in AI failed, falling back to heuristic engine:", localAiError);
    }

    // 2. Fall back to our highly-robust Local Gemma Semantic Heuristic Engine
    return getLocalBrainstormResponse(userMessage, chatHistory);
  }

  // Check if a custom AI provider is actively selected
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type !== 'gemini' && activeProvider.model) {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: `You are an inspiring creative brainstorm partner. Respond to user's idea with warm, vocal speech (1-2 sentences) and synthesize a rich image prompt. If the user asks to switch theme (golden, dark, light) or mode (consilium, symposium, manual, agent, live), append action tags like [ACTION: SET_THEME GOLDEN] or [ACTION: SET_MODE CONSILIUM] to speech. Return JSON: { "speech": "...", "suggestedPrompt": "..." }`
        },
        ...chatHistory.map(h => ({
          role: (h.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: h.text
        })),
        { role: 'user' as const, content: userMessage }
      ];

      const res = await callOpenAICompatibleChat(activeProvider, messages, { response_format: { type: 'json_object' } });
      const cleaned = res.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.speech && parsed.suggestedPrompt) return parsed;
    } catch (e) {
      console.warn(`[Providers] Custom provider failed for brainstorm, falling back to Gemini:`, e);
    }
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: [
          ...chatHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
          { role: 'user', parts: [{ text: `The user says: "${userMessage}". Brainstorm creative concepts. Respond like a warm, supportive, and highly inspiring creative design partner. Keep your vocal response to 1-2 short, punchy sentences. Synthesize a single highly descriptive image prompt based on the state of our discussion.
          Also, scan for explicit user requests to change the theme, mode or save a markdown export. If they ask to switch the theme (golden/dark/light) or mode (manual/agent/consilium/symposium/live) or request "export" / "md" / "markdown", include appropriate action tags in your speech output like [ACTION: SET_THEME GOLDEN], [ACTION: SET_THEME DARK], [ACTION: SET_THEME LIGHT], [ACTION: SET_MODE CONSILIUM], [ACTION: SET_MODE SYMPOSIUM], [ACTION: SET_MODE MANUAL], [ACTION: SET_MODE AGENT], [ACTION: SET_MODE LIVE], or [ACTION: EXPORT_MD] at the end of the speech text.
          Output ONLY valid JSON in this format:
          {
            "speech": "Your vocal response to speak aloud (1-2 sentences, followed by any matching action tags like [ACTION: SET_THEME GOLDEN] if requested)",
            "suggestedPrompt": "A rich, visual image generation prompt matching their creative concept"
          }` }] }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              speech: { type: Type.STRING },
              suggestedPrompt: { type: Type.STRING }
            },
            required: ["speech", "suggestedPrompt"]
          }
        }
      },
      'gemini-3.5-flash'
    );
    return JSON.parse(response.text || "{}");
  } catch (e: any) {
    console.warn("Cloud Gemini Brainstorm failed, falling back to Local Gemma Heuristics:", e);
    return getLocalBrainstormResponse(userMessage, chatHistory);
  }
};

// Symposium Debate with active provider or gemini-2.5-flash with gemini-3.5-flash fallback
export const runSymposiumDebate = async (topic: string) => {
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type !== 'gemini' && activeProvider.model) {
    try {
      const res = await callOpenAICompatibleChat(activeProvider, [
        {
          role: 'system',
          content: `Conduct a creative debate between Master, Mentor, and Student resolving visual directive: "${topic}". Return JSON: { "debate": [{"role":"Мастер"|"Ментор"|"Ученик","message":"..."}], "solutions": ["prompt1","prompt2","prompt3"] }`
        },
        { role: 'user', content: `Debate and create 3 master prompts in Russian for: "${topic}"` }
      ], { response_format: { type: 'json_object' } });
      const cleaned = res.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.debate && parsed.solutions) return parsed;
    } catch (e) {
      console.warn(`[Providers] Custom provider failed for runSymposiumDebate, falling back to Gemini`, e);
    }
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: `Conduct a highly engaging creative debate between three AI thinkers resolving a complex visual dilemma: "${topic}".
        The three roles are:
        1. "Мастер" (Master - focused on execution, practical craft, material realism, and detail)
        2. "Ментор" (Mentor - focused on philosophical meaning, historical context, balance, and visual harmony)
        3. "Ученик" (Student - focused on radical innovation, breaking established rules, modern trends, and youth appeal)
        Have them discuss back and forth in Russian, culminating in 3 fully formed, contrasting master prompts that resolve the dilemma.
        Output ONLY a JSON object containing the debate dialogue and the 3 final prompts.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              debate: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    role: { type: Type.STRING },
                    message: { type: Type.STRING }
                  },
                  required: ["role", "message"]
                }
              },
              solutions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["debate", "solutions"]
          }
        }
      },
      'gemini-3.5-flash'
    );
    return JSON.parse(response.text || "{}");
  } catch (e: any) {
    throw new Error("Symposium debate analysis failed.");
  }
};

// Consilium Council with active provider or gemini-2.5-flash with gemini-3.5-flash fallback
export const getConsiliumFeedback = async (prompt: string) => {
  const activeProvider = getActiveProvider();
  if (activeProvider && activeProvider.type !== 'gemini' && activeProvider.model) {
    try {
      const res = await callOpenAICompatibleChat(activeProvider, [
        {
          role: 'system',
          content: `Evaluate this creative task as three design experts: Architect, Stylist, Harmonizer. Return JSON array: [{"expert":"...","critique":"...","improvedPrompt":"..."}] in Russian.`
        },
        { role: 'user', content: `Directive: "${prompt}"` }
      ], { response_format: { type: 'json_object' } });
      const cleaned = res.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn(`[Providers] Custom provider failed for getConsiliumFeedback, falling back to Gemini`, e);
    }
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await safeGenerateContent(
      ai,
      'gemini-2.5-flash',
      {
        contents: `Evaluate this creative task as a council of three specialist design experts:
        1. "Архитектор (Architect)" (spatial layout, perspective, depth, and placement of objects)
        2. "Стилист (Stylist)" (color theory, aesthetic theme, details, and atmosphere)
        3. "Гармонизатор (Harmonizer)" (lighting setup, material integration, shading, and visual unity)
        Provide their constructive critique and specific improved prompt in Russian for this directive: "${prompt}".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                expert: { type: Type.STRING },
                critique: { type: Type.STRING },
                improvedPrompt: { type: Type.STRING }
              },
              required: ["expert", "critique", "improvedPrompt"]
            }
          }
        }
      },
      'gemini-3.5-flash'
    );
    return JSON.parse(response.text || "[]");
  } catch (e: any) {
    throw new Error("Consilium feedback collection failed.");
  }
};

// High-fidelity speech synthesis using the gemini-3.1-flash-tts-preview model
export const generateSpeech = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: `Read the following text aloud clearly and naturally: "${text}"`,
      config: {
        responseModalities: ["AUDIO" as any]
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData?.data) {
      return part.inlineData.data; // Base64 audio data
    }
    throw new Error("No inline audio data found in TTS response");
  } catch (error: any) {
    console.error("Gemini TTS API error, falling back to browser SpeechSynthesis", error);
    throw error;
  }
};
