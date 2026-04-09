import releaseMetadata from "./release.json" with { type: "json" };

export const PRIVACY_POLICY_PATH = "/privacy";
export const RELEASE_NOTES_PATH = "/releases/latest";
export const DOWNLOAD_LATEST_PATH = "/downloads/hkipo-macos-latest";

const FAVICON_BASE64 =
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhcXFx0dHR0jHR0dIx0dHSMdHR0jMCcdIzAnHSMXFxcdAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAISEhKSklJb8oJSXvKCUl9CclJPQnJST0JSQk9D4zIfRFNyH0JCQl7yklJcAgICAqAAAAAAAAAAAAAAAAAAAAAysoKL0wLSz/LSsp/y8rKf8tKyn/Lysp/ywpK/9EOCb/Szsm/ysoKf8wLCz/KycnvwAAAAMAAAAAAAAAAC8vLxYyLCztNC8v/zIuLf8yLy3/Mi4t/zIuLf8wLC3/Rzoq/04+Kf8vLC3/NC8v/zIsLO4sLCwXAAAAAAAAAAAyMjIbNTAv8DYxMP81MC//NjEw/zYxMP85NDL/NjMy/0w+Lv9TQi3/NDAx/zYxMf82MTHxMDAwHAAAAAAAAAAAPT09HE5IR/BfW1r/V1RS/0lERP9EPj3/Y2Fg/1dUVf9MPi3/VUUv/0E+P/9LRUT/OjQy8T0wMBwAAAAAAAAAAFFRURxGRETxJSQk/zo3N/9kYmL/b2xr/zo5Of9OTE7/aV1O/1hGMf9jYGH/bWlp/z41NPE9PT0cAAAAAAAAAAAXFxccFRQU8R0bG/8aFxf/FxUV/2NiYv8oJSX/FxUX/2VcUf92a13/VFNV/1JQUP9aVFLxPTAwHAAAAAAAAAAAFxcXHB4dHfEhICD/IB4e/yAeHv8gHR3/IB4e/xUXG/93XDL/ims3/xASGP8iISH/VlNS8XdvbhwAAAAAAAAAACQXFxwhHh7xJSIi/yQhIf8kISH/JCEh/yQhIf8dGyD/Yk4q/3BYLP8bGyD/JCEh/x4bG/EkJCQcAAAAAAAAAAAgICAVJSIi7SglJf8nJCT/JyQk/yckJP8nJCT/JSIk/zkuH/8/MR//JCIk/yglJf8lIiLuHh4eFgAAAAAAAAAAAAAAAiglJbgtKin/Kycn/ywoKP8rKCf/Kygo/ygnKP9BNSP/SDkj/ygmKP8tKin/KyQkugAAAAMAAAAAAAAAAAAAAAAoKCgiLysrtS8rK+kvKyvvLSsr8C8rK/AsKSvwRDcn8Es7Ju8rKSzpLysrtjAnJyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyMjIUNCcnGjQnJxoyJjMbMiYzG0w0JhpMQCYaMiMzFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const PRIVACY_CONTACT_PLACEHOLDER = "oodicraft@gmail.com";

interface DirectReleaseMetadata {
  platform: string;
  channel: string;
  latestVersion: string;
  latestBuild: number;
  downloadUrl: string;
  publishedAt: string;
  notes: string;
  releaseNotes: string[];
}

export interface AppUpdateResponse {
  updateAvailable: boolean;
  latestVersion: string;
  latestBuild: number;
  downloadUrl: string;
  releaseNotesUrl: string;
  publishedAt: string;
  notes: string;
}

const release = releaseMetadata as DirectReleaseMetadata;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function renderPageShell(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <style>
      :root {
        color-scheme: light;
        --bg: #faf6f2;
        --surface: #fffdf9;
        --border: rgba(26, 24, 21, 0.12);
        --text: #1a1815;
        --muted: #5c554c;
        --accent: #1d1d1f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: "Barlow", "Avenir Next", "Segoe UI", sans-serif;
      }
      .page {
        width: min(820px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 72px;
      }
      .card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 12px 40px rgba(26, 24, 21, 0.05);
      }
      h1, h2 { margin: 0 0 12px; }
      p, li { color: var(--muted); line-height: 1.7; }
      section + section { margin-top: 24px; }
      ul { padding-left: 20px; }
      a { color: var(--accent); }
      .eyebrow {
        display: inline-block;
        margin-bottom: 10px;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .meta {
        margin-top: 20px;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="card">
        ${body}
      </div>
    </main>
  </body>
</html>`;
}

export function getAppUpdate(params: {
  platform: string;
  channel: string;
  currentVersion: string;
  currentBuild: number;
}): AppUpdateResponse {
  const platformMatches = params.platform === release.platform;
  const channelMatches = params.channel === release.channel;
  const newerVersion = compareSemver(release.latestVersion, params.currentVersion) > 0;
  const newerBuild = release.latestBuild > params.currentBuild;

  return {
    updateAvailable: platformMatches && channelMatches && (newerVersion || newerBuild),
    latestVersion: release.latestVersion,
    latestBuild: release.latestBuild,
    downloadUrl: DOWNLOAD_LATEST_PATH,
    releaseNotesUrl: RELEASE_NOTES_PATH,
    publishedAt: release.publishedAt,
    notes: release.notes
  };
}

export function getLatestDownloadUrl(): string {
  return release.downloadUrl;
}

export function renderReleaseNotesPage(): string {
  const body = `
    <span class="eyebrow">Release Notes</span>
    <h1>HOOOK ${escapeHtml(release.latestVersion)} (${release.latestBuild})</h1>
    <p>${escapeHtml(release.notes)}</p>
    <section>
      <h2>本次更新</h2>
      <ul>
        ${release.releaseNotes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
    <p class="meta">发布时间：${escapeHtml(release.publishedAt)}</p>
  `;

  return renderPageShell("HOOOK Release Notes", "HOOOK macOS 最新版本更新说明。", body);
}

export function renderPrivacyPolicyPage(): string {
  const body = `
    <span class="eyebrow">Privacy Policy</span>
    <h1>HOOOK 隐私政策</h1>
    <p>本页面说明 HOOOK macOS 应用与 hkipo.langtangs.com 网站在提供港股 IPO 数据服务时，如何处理与你相关的数据。</p>
    <section>
      <h2>我们会收集哪些数据</h2>
      <ul>
        <li>网站访问时的基础访问统计，例如页面浏览量、访客去重后的日活数据。</li>
        <li>macOS 应用最小范围的匿名使用数据，包括应用活跃和用户保存申购数据的行为。</li>
        <li>你在本地填写和保存的申购数量、中签数量、申购方式等数据。</li>
      </ul>
    </section>
    <section>
      <h2>本地保存的数据</h2>
      <p>你在 HOOOK 中录入的用户申购数据默认保存在你的设备本地，用于展示资金占用、申购记录和备份导入导出。</p>
    </section>
    <section>
      <h2>网站访问与应用埋点</h2>
      <p>我们仅使用基础分析能力统计网站访问和应用活跃，不会在分析库中保存你的明文 IP 地址，也不会保存明文设备标识。用于分析的标识会在进入分析系统前进行匿名化处理。</p>
    </section>
    <section>
      <h2>使用的基础设施</h2>
      <p>网站与 API 运行在 Cloudflare Workers 上，分析数据会使用 Cloudflare D1 和 Workers Analytics Engine 进行汇总与存储。</p>
    </section>
    <section>
      <h2>数据保留与安全</h2>
      <p>我们尽量只保留提供服务和基础分析所必需的数据，并通过最小化字段、匿名化处理和访问控制降低隐私风险。</p>
    </section>
    <section>
      <h2>你的权利</h2>
      <p>如果你希望了解、删除或更正与你相关的数据，或对本隐私政策有疑问，可以通过以下方式联系我们。</p>
    </section>
    <section>
      <h2>联系方式</h2>
      <p>${escapeHtml(PRIVACY_CONTACT_PLACEHOLDER)}</p>
    </section>
  `;

  return renderPageShell("HOOOK 隐私政策", "HOOOK macOS 应用与官网服务的基础隐私政策。", body);
}

export function faviconResponse(): Response {
  const bytes = Uint8Array.from(atob(FAVICON_BASE64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": "image/x-icon",
      "cache-control": "public, max-age=86400"
    }
  });
}
