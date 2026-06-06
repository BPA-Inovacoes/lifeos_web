import gameManualRaw from "../../../../content/MANUAL-GAME-MODE.md?raw";

/** Texto do manual Game Mode para a app. */
export function getGameManualMarkdown(): string {
  return gameManualRaw.replace(/\*Última atualização:[^\n]*\n?/m, "");
}
