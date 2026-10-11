import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";

export async function pickTextFile(): Promise<{ name: string; content: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  let content: string;
  if (Platform.OS === "web") {
    content = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
  } else {
    content = await new File(a.uri).text();
  }
  return { name: a.name, content };
}

/** Share / export a document. Returns "shared" or "copied" (web fallback). */
export async function shareText(name: string, content: string): Promise<"shared" | "copied"> {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) {
    await Clipboard.setStringAsync(content);
    return "copied";
  }
  const safe = name.replace(/[^\w.-]+/g, "_") || "document.txt";
  const f = new File(Paths.cache, safe);
  if (f.exists) f.delete();
  f.create();
  f.write(content);
  await Sharing.shareAsync(f.uri, { mimeType: "text/plain", dialogTitle: name });
  return "shared";
}

export const copyText = (t: string) => Clipboard.setStringAsync(t);
