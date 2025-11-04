import { StartScreenPrompt, ThemeOption } from "@openai/chatkit";

export const WORKFLOW_ID =
  process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

// No suggested prompts on the start screen.
export const STARTER_PROMPTS: StartScreenPrompt[] = [];

export const PLACEHOLDER_INPUT = "Type a new question...";

export const GREETING = "How can I assist you?";

export const getThemeConfig = (): ThemeOption => ({
  color: {
    grayscale: {
      hue: 200,
      tint: 6,
      shade: -4,
    },
    accent: {
      primary: "#52B8C5", // CPSgo teal color
      level: 1,
    },
  },
  radius: "round",
  // Add other theme options here
  // chatkit.studio/playground to explore config options
});
