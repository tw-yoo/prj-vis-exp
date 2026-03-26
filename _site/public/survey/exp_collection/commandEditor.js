/**
 * Monaco-powered command editor for experiment collection.
 * - Replaces the textarea typing UX with IntelliSense (autocomplete, hovers, signature help).
 * - Keeps #combined-input as source of truth (sync both directions).
 * - Provides a simple DSL executor supporting parallel (+) and sequential (->) semantics.
 */

const MONACO_VERSION = "0.45.0";
const MONACO_CDN_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;
const DTS_PATH = "./command-api.d.ts";

// --- DOM wiring ---
const textarea = document.getElementById("combined-input");
if (textarea) {
  textarea.classList.add("combined-input-source");
}

const editorContainer = document.createElement("div");
editorContainer.id = "command-editor";
editorContainer.style.width = "100%";
editorContainer.style.minHeight = "220px";
editorContainer.style.border = "1px solid #d1d5db";
editorContainer.style.borderRadius = "10px";
editorContainer.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.04)";
editorContainer.style.marginTop = "6px";

const help = document.createElement("div");
help.className = "command-help";
help.textContent = "Parallel: A(...) + B(...)   |   Sequential: A(...) -> B(...)   |   Mixed: A(...) + B(...) -> C(...) + D(...)";
help.style.fontSize = "13px";
help.style.color = "#4b5563";
help.style.margin = "10px 0 6px";

if (textarea && textarea.parentElement) {
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.setAttribute("aria-hidden", "true");
  textarea.parentElement.insertBefore(help, textarea);
  textarea.parentElement.insertBefore(editorContainer, textarea);
}

// --- README toggle / rendering ---
const docToggle = document.getElementById("doc-toggle");
const docPanel = document.getElementById("doc-panel");
const layout = document.querySelector(".exp-layout");
const runButton = document.getElementById("run-script-btn");

function simpleMarkdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3>${line.slice(4)}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${line.slice(3)}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      html.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${line.slice(2)}</li>`);
      continue;
    }
    const esc = line.replace(/`([^`]+)`/g, "<code>$1</code>");
    html.push(`<p>${esc}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

async function loadReadme() {
  if (!docPanel) return;
  if (docPanel.dataset.loaded === "true") return;
  const res = await fetch("./README.md");
  if (!res.ok) {
    docPanel.innerHTML = "<p>README를 불러오지 못했습니다.</p>";
    return;
  }
  const text = await res.text();
  docPanel.innerHTML = simpleMarkdownToHtml(text);
  docPanel.dataset.loaded = "true";
}

if (docToggle && docPanel && layout) {
  docToggle.addEventListener("click", async () => {
    await loadReadme();
    layout.classList.toggle("with-docs");
    docToggle.textContent = layout.classList.contains("with-docs") ? "README 닫기" : "README 보기";
  });
}

async function executeCurrentScript() {
  const script = textarea?.value || "";
  try {
    await runCommandScript(script);
  } catch (err) {
    const msg = err?.message || err;
    alert(`명령 실행 실패:\n${msg}`);
  }
}

if (runButton) {
  runButton.addEventListener("click", () => {
    executeCurrentScript();
  });
}

// --- Monaco loader ---
function loadMonaco() {
  if (window.monaco) return Promise.resolve(window.monaco);
  return new Promise((resolve, reject) => {
    const loader = document.createElement("script");
    loader.src = `${MONACO_CDN_BASE}/vs/loader.js`;
    loader.async = true;
    loader.onload = () => {
      // AMD loader is available as global require
      // eslint-disable-next-line no-undef
      require.config({ paths: { vs: `${MONACO_CDN_BASE}/vs` } });
      // eslint-disable-next-line no-undef
      require(["vs/editor/editor.main"], () => resolve(window.monaco));
    };
    loader.onerror = (err) => reject(err);
    document.body.appendChild(loader);
  });
}

async function loadDts(monaco) {
  const res = await fetch(DTS_PATH);
  if (!res.ok) {
    console.warn("Failed to load command-api.d.ts");
    return;
  }
  const content = await res.text();
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    noLib: true
  });
  // minimal global/Promise defs to avoid bringing in full lib.d.ts (keeps suggestions limited)
  const minimalLib = `
    declare const window: any;
    interface PromiseConstructor {
      new <T>(executor: any): Promise<T>;
      resolve<T>(value: T | PromiseLike<T>): Promise<T>;
      all(values: any[]): Promise<any>;
    }
    interface Promise<T> {
      then: any;
      catch: any;
      finally: any;
    }
  `;
  monaco.languages.typescript.typescriptDefaults.addExtraLib(minimalLib, "ts:minimal-lib.d.ts");
  monaco.languages.typescript.typescriptDefaults.addExtraLib(content, "ts:command-api.d.ts");
}

// --- Simple DSL parser ---
function splitTopLevel(text, separator) {
  const parts = [];
  let buf = "";
  let depthParen = 0, depthBracket = 0, depthBrace = 0;
  let inString = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      buf += ch;
      if (ch === inString && prev !== "\\") {
        inString = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inString = ch;
      buf += ch;
      continue;
    }
    if (ch === "(") depthParen++;
    if (ch === ")") depthParen = Math.max(0, depthParen - 1);
    if (ch === "[") depthBracket++;
    if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
    if (ch === "{") depthBrace++;
    if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);

    const atTop = depthParen === 0 && depthBracket === 0 && depthBrace === 0 && !inString;
    if (atTop) {
      if (separator.length === 2 && text.slice(i, i + 2) === separator) {
        parts.push(buf.trim());
        buf = "";
        i++; // skip next char of multi-char separator
        continue;
      }
      if (separator.length === 1 && ch === separator) {
        parts.push(buf.trim());
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim().length > 0) {
    parts.push(buf.trim());
  }
  return parts.filter(Boolean);
}

function parseArgs(argText) {
  if (!argText || !argText.trim()) return [];
  const rawArgs = splitTopLevel(argText, ",");
  return rawArgs.map((tok) => parsePrimitive(tok.trim()));
}

function parsePrimitive(token) {
  if (token === "") return "";
  const lc = token.toLowerCase();
  if (lc === "true") return true;
  if (lc === "false") return false;
  if (lc === "null") return null;
  if (!Number.isNaN(Number(token)) && token.trim() !== "") return Number(token);
  if (/^[A-Za-z_$][\w$]*$/.test(token) && typeof window !== "undefined" && token in window) {
    return window[token];
  }
  if ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith("`") && token.endsWith("`"))) {
    return token.slice(1, -1);
  }
  if ((token.startsWith("{") && token.endsWith("}")) || (token.startsWith("[") && token.endsWith("]"))) {
    try {
      return JSON.parse(token);
    } catch (err) {
      throw new Error(`Invalid JSON argument: ${token}`);
    }
  }
  // fallback: treat as raw string
  return token;
}

function parseAction(text, stageIndex, actionIndex) {
  const openIdx = text.indexOf("(");
  const closeIdx = text.lastIndexOf(")");
  if (openIdx === -1) {
    return { name: text.trim(), args: [], stageIndex, actionIndex, raw: text };
  }
  if (closeIdx < openIdx) {
    throw new Error(`Unmatched parentheses in action "${text}"`);
  }
  const name = text.slice(0, openIdx).trim();
  const argsText = text.slice(openIdx + 1, closeIdx);
  const args = parseArgs(argsText);
  return { name, args, stageIndex, actionIndex, raw: text };
}

function parseScript(script) {
  // Precedence: split by top-level '->' into stages, then split each stage by top-level '+'.
  const trimmed = script.trim();
  if (trimmed === "") {
    throw new Error("No commands found. Use syntax: A(...) + B(...) -> C(...)");
  }
  if (/->\s*$/.test(trimmed)) {
    throw new Error("Script cannot end with '->'. Add a stage after the arrow.");
  }
  if (/->\s*->/.test(trimmed)) {
    throw new Error("Empty stage detected near '-> ->'.");
  }
  const stagesRaw = splitTopLevel(script, "->");
  if (!stagesRaw.length) {
    throw new Error("No commands found. Use syntax: A(...) + B(...) -> C(...)");
  }
  return stagesRaw.map((stageText, stageIdx) => {
    const stageTrimmed = stageText.trim();
    if (/\+\s*$/.test(stageTrimmed)) {
      throw new Error(`Stage ${stageIdx + 1} cannot end with '+'. Add an action after '+'.`);
    }
    if (/\+\s*\+/.test(stageTrimmed)) {
      throw new Error(`Empty action detected near '++' in stage ${stageIdx + 1}.`);
    }
    const actionsRaw = splitTopLevel(stageText, "+");
    if (!actionsRaw.length) {
      throw new Error(`Empty stage near "->" at stage ${stageIdx + 1}`);
    }
    return actionsRaw.map((actionText, actionIdx) => {
      if (!actionText.trim()) {
        throw new Error(`Empty action near "+" at stage ${stageIdx + 1}, action ${actionIdx + 1}`);
      }
      return parseAction(actionText.trim(), stageIdx, actionIdx);
    });
  });
}

// --- Action resolver + executor ---
const actionLibraryPromise = (async () => {
  const [anim, tmpl, line, chartCtx, mark, annot, events] = await Promise.all([
    import("../../operations/animationHelpers.js"),
    import("../../operations/operationTemplates.js"),
    import("../../operations/line/common/lineRenderHelpers.js"),
    import("../../operations/common/chartContext.js"),
    import("../../operations/common/markAccessors.js"),
    import("../../operations/common/annotations.js"),
    import("../../operations/common/events.js")
  ]);
  return {
    ...anim,
    ...tmpl,
    ...line,
    lineAddValueLabel: line.addValueLabel, // alias to disambiguate
    ...chartCtx,
    ...mark,
    ...annot,
    ...events
  };
})();

async function executeAction(action, lib) {
  const fn = lib[action.name];
  if (typeof fn !== "function") {
    throw new Error(`Unknown action "${action.name}"`);
  }
  const result = fn(...action.args);
  return Promise.resolve(result);
}

export async function runCommandScript(script) {
  const lib = await actionLibraryPromise;
  const parsed = parseScript(script);
  // Each stage runs actions in parallel; stages execute sequentially.
  for (let stageIdx = 0; stageIdx < parsed.length; stageIdx++) {
    const stage = parsed[stageIdx];
    const tasks = stage.map((action) =>
      executeAction(action, lib).catch((err) => {
        const message = `Stage ${stageIdx + 1}, action ${action.actionIndex + 1} ("${action.raw}") failed: ${err.message || err}`;
        throw new Error(message);
      })
    );
    await Promise.all(tasks);
  }
}

// expose for other scripts / console use
window.runCommandScript = runCommandScript;

// --- Monaco bootstrap ---
async function initEditor() {
  const monaco = await loadMonaco();
  await loadDts(monaco);

  const model = monaco.editor.createModel(
    textarea?.value || "",
    "typescript",
    monaco.Uri.parse("inmemory://model/command-editor.ts")
  );

  const editor = monaco.editor.create(editorContainer, {
    model,
    language: "typescript",
    theme: "vs",
    minimap: { enabled: false },
    automaticLayout: true,
    lineNumbers: "off",
    fontSize: 14,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 },
    wordBasedSuggestions: false,
    suggest: {
      showKeywords: false,
      showSnippets: false,
      showWords: false,
      showClasses: false,
      showStructs: false,
      showMethods: false,
      showConstructors: false,
      showProperties: false,
      showFiles: false,
      showFolders: false,
      showVariables: false,
      showUnits: false,
      showText: false,
      showColors: false,
      showColorsInline: false,
      showModules: false,
      showInterfaces: false,
      showEvents: false,
      showIssues: false
    }
  });

  let silent = false;
  model.onDidChangeContent(() => {
    if (!textarea) return;
    silent = true;
    // Editor -> textarea (source of truth for existing flows)
    textarea.value = model.getValue();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    silent = false;
  });

  if (textarea) {
    textarea.addEventListener("input", () => {
      if (silent) return;
       // Textarea programmatic changes -> editor
      model.setValue(textarea.value);
    });
  }

  // Custom completion: only expose whitelisted action names
  monaco.languages.registerCompletionItemProvider("typescript", {
    triggerCharacters: ["+", ">", " ", "(", ","],
    provideCompletionItems: async (model, position) => {
      const lib = await actionLibraryPromise;
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      const suggestions = Object.keys(lib)
        .filter((k) => typeof lib[k] === "function")
        .map((name) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${name}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        }));
      return { suggestions };
    }
  });

  // Cmd/Ctrl + Enter 실행
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    executeCurrentScript();
  });
}

initEditor().catch(err => console.error("Failed to init command editor", err));
