# Devpost 提出物メモ

締切: **2026-08-31 17:00 PT ＝ 日本時間 9/1(火) 09:00**
狙う枠: **Individual/Hobbyist**（$10,000 × 2）

## 要件の対応表

| 要件 | 対応 | 状態 |
|---|---|---|
| Gemini 3.5 以降 | `gemini-3.7-flash`（`agents/config.js` で明示指定） | ✅ |
| Googleエージェントフレームワーク | Google ADK TypeScript `@google/adk` v2.0（Workflow） | ✅ |
| Google Cloudインフラ | Cloud Run（asia-northeast1） | ✅ |
| ホスト済みURL | **https://mottainai-720945218465.asia-northeast1.run.app** | ✅ |
| コードリポジトリ | **https://github.com/makoto680/mottainai** | ✅ |
| 構成図 | `ARCHITECTURE.md` | ✅ |
| README（起動手順込み） | `README.md` | ✅ |
| デモ動画 4分以内・英語または英語字幕 | 下の台本 | ⏸ |
| 動画は**YouTubeかVimeoに公開アップ** | 提出時にアップ | ⏸ |
| 動画に**未編集のライブ実行**を含める | 台本を待ちカット無しに修正済（下記） | ✅ |
| **カテゴリ選択**（3択から1つ） | **Taskmaster に確定**（2026-08-25 本人決定） | ✅ |
| 期間中に新規作成 | 2026-08-24 着手・全て新規 | ✅ |

### ルール実物との照合（2026-08-25・rules頁を直接確認）

- **カテゴリは3択**：①Taskmaster（人手介入なしの多段バックグラウンド処理＋自分の摩擦を解く"BYOF"）②Collaborative Partner（質問で導く・フィードバックで適応し続ける）③Enterprise Fleet（企業向け）。
  **MOTTAINAIはTaskmaster が合う**＝スクショを渡した瞬間にフリートが自走して答えまで到達、チャットしない設計そのもの。Collaborative Partnerは「適応し続ける仕組み」が必要で、うちには無い。
- **審査配点**：革新性・実用性40% ／ アーキテクチャ30% ／ デモ・再現性・ドキュメント30%（→構成図とREADMEの再現手順が直接採点対象）
- **ボーナス最大+0.6**（Stage Two通過後に加点・スコアは1〜6）：
  - 制作過程の公開記事/動画（+0.2）→ **note記事1本で取れる**（本人判断）
  - `#AllThingsAgenticHackathon` 付きSNS投稿（+0.2）→ **X投稿1本で取れる**（本人判断）
  - Gemma/Veo/Lyria等の追加Googleモデル統合（+0.2/個）→ 締切前の無理な増築はしない
- リポジトリは**公開済みを確認**（makoto680/mottainai）＝審査用の権限付与は不要

### ボーナス2種 ✅公開済み（2026-08-25 夜・URLを提出フォームのボーナス欄へ貼る）

- **制作記事（+0.2）✅公開済**: https://note.com/mako68/n/n3d9fc3f685c0
- **X投稿（+0.2）✅投稿済**: https://x.com/aishiroto/status/2092234191354396992 （#AllThingsAgenticHackathon 付き・GitHubカード展開確認済み）

### ボーナス用の下書き（元データ・公開済みのため参照用）

- **制作記事（+0.2）**: `note_drafts\2026-08-25_mottainai_gyakuteian.md` に下書き済み
  （逆張り断定＋一次体験の型。宣伝型は書かない）
- **X投稿（+0.2）**: 下記をコピペ（⚠本文なしURLだけの投稿は伸びない事故が過去にあった。必ず本文ごと）

> PC買い替え相談ツールは、日本語でも英語でも最後は全部「買え」で終わる。
> 逆に「買わなくていい理由」を探すAIを作ってGoogleのハッカソンに出す。
> 金額の判定はAIじゃなくコードがやる。テスト127項目。
> #AllThingsAgenticHackathon
> https://github.com/makoto680/mottainai

## 本番環境

- **公開URL**: https://mottainai-720945218465.asia-northeast1.run.app
- プロジェクト: `lucid-charmer-431015-i6` / リージョン: `asia-northeast1`（東京）
- サービス名: `mottainai` / メモリ512Mi・CPU1・最大3インスタンス
- APIキーは環境変数として渡してあり、イメージにもGitにも入っていない（`.dockerignore`で`.env`を除外）

再デプロイ:
```powershell
$env:PATH += ";L:\gcloud\google-cloud-sdk\bin"
cd L:\10\claude_demo\mottainai
gcloud run deploy mottainai --source . --region asia-northeast1 --allow-unauthenticated --quiet
```
※環境変数は保持されるので、キーの再指定は不要。

動画で「Google Cloudで動いている」ことを示す用:
```powershell
gcloud run services describe mottainai --region asia-northeast1
```

## 動画の台本（目標 3分30秒・顔出しなし・画面録画のみ）

英語字幕を焼く。話者が映る要件は無いので、画面と字幕だけで成立させる。

---

**[0:00–0:25] 問題**

> 画面：一般的なPC構成サイトを2〜3個、静かにスクロール
>
> 字幕:
> "Every PC advisor on the internet answers the same way: buy more.
> Pick your use case, receive a build — and the more expensive that build,
> the more the site earns.
> I have been building PCs since Windows 95. That advice is usually wrong."

**[0:25–0:50] この道具は逆を返す**

> 画面：MOTTAINAI のトップ。タグラインを見せる
>
> 字幕:
> "MOTTAINAI is the Japanese word for the regret of letting something useful go to waste.
> This agent looks for reasons you do NOT need to spend money.
> The answer it is most pleased to reach is zero."

**[0:50–1:40] 実演①：スクショ2枚**

> 画面：設定 › システム › 詳細情報 を <kbd>Win+Shift+S</kbd> で切り取り → ページに <kbd>Ctrl+V</kbd>
> → ドライブの最適化画面（メディアの種類の列）も同じ手順で貼る → 用途を選ぶ → 実行
> フリートのパネルが動き出すところを2〜3秒だけ見せる
>
> 字幕:
> "You do not need to open the case or know what is inside.
> Windows already knows — two of its own screens say everything this tool judges.
> Snip, paste, done. Two agents start at once — one reads the hardware from the images,
> one reads what you actually do with the machine.
> Then the verdict is computed. Not by a model — by ordinary, tested code."
>
> ⚠ 判定は15〜35秒かかる（Gemini側のテール遅延）が、**ルールが「未編集のライブ実行」を
> 要求しているためカットしない**。待ち時間は[2:50]の設計思想の字幕をここに前倒しして埋める
> ＝実行は途切れず映り続け、無言の待ちも生まれない。フリートのパネルが動いているので
> 画面が止まって見えることもない。

**[1:40–2:20] 結果**

> 画面：判定結果。見出し → 部位ごとの表 → Windows 11 の欄
>
> 字幕:
> "A 2017 office machine. The CPU is fine — years of headroom for this use.
> The graphics card is not something you should buy at all.
> One part is holding it back: the hard drive.
> Nine thousand nine hundred and ninety yen. Not a new computer."

**[2:20–2:50] 効いている判断を2つ**

> 画面：ストレージ行の「この用途に必要なのは256GB」の注記を拡大
>
> 字幕:
> "Two decisions a shopping tool never makes.
> It sizes the fix to the need — a 1TB drive does not imply a 1TB replacement.
> And when an upgrade costs as much as a whole used machine, it says so,
> and removes it from the total."

**[2:50–3:15] 設計の芯**（※字幕を実演①の待ち時間に前倒しした場合、ここは `npm test` の画面だけ残して短縮）

> 画面：`core/verdict.js` を映し、`npm test` を流して **127 passed** を見せる
>
> 字幕:
> "Models perceive and explain. Deterministic code decides.
> A tool that argues from cost cannot afford a hallucinated price.
> An early version printed 'solved for free' while quietly needing 15,800 yen of RAM.
> There is now a test that fails if a headline claims zero while any part is short."

**[3:15–3:30] Google Cloud で動いていること**

> 画面：`gcloud run services describe mottainai` の出力 → 公開URLを開いて動かす
>
> 字幕:
> "Running on Cloud Run, with Gemini 3.7 Flash behind the two perception agents.
> Windows 10 support ends October 2027. Hundreds of millions of machines
> are about to be told they are obsolete. Most of them are not."

---

## 録画時の注意（2026-08-25 追記）

- **既存の録画は使えない**（「あと約10年」の旧文言＋フッター22項目が映っている。現在は127項目）
- 画面の文字は全部英語になっている。字幕と画面の言語が揃うので焼き込みは判定文の補足だけでいい
- **「Solved for ¥0. One BIOS setting is all it takes.」はスクショ経路では絶対に出ない**
  （TPMが映る画面を撮らせていないため）。この文言を録画に入れたいなら手入力デモで
  tpm=disabled を指定する。出ないのが正常であり、スクショ経路の見出しは
  「There is nothing to buy. Worst case, Windows 11 asks for one free BIOS setting.」
- 判定は15〜35秒。**「未編集のライブ実行」が要件＝待ちはカットせず**、その間に設計思想の字幕を流す（台本参照）
- 完成した動画は**YouTubeかVimeoに公開**でアップしてURLを提出フォームに貼る

## 動画で必ず映すもの（要件）

- [ ] **バックエンドがGoogle Cloudで動いていること** → `gcloud run services describe` の出力、または Cloud Run コンソールの画面
- [ ] 実際に動いているところ（入力→結果）
- [ ] 英語字幕（音声なしでも成立する形）

## 提出フォームに書くこと

**Inspiration**
30年ぶんの自作PCの経験と、そこで毎回見る同じ光景。人は必要のない性能に金を払い、
本当に効く1点（多くはストレージ）を見落とす。既存のツールは全部、上に外れる側に立っている。

**What it does**
写真1枚と「何に使っているか」から、替えなくていい部位・余りすぎている部位・
本当に足りていない1点を返す。Windows 11 に上げられない機体には、買い替え以外の道を先に示す。

**How I built it**
Google ADK (TypeScript) の Workflow で、画像読み取りと用途解釈を並列に走らせ、
決定論の判定エンジンに合流させる。判定にモデルは入らない。Cloud Run で公開。

**Challenges**
ADK の静的グラフは入ってくる辺の数だけ下流ノードを起動するため、
知覚2本を1回だけ合流させるには `dynamicEntry` が要った。
もう1つは自分のコードが金額で嘘をついたこと（上の台本にある通り）。

**What I learned**
「モデルに決めさせない範囲」を先に決めることが、この種の道具では設計の中心になる。

**What's next**
日本語のPC比較サイトとして常設し、型番データを継続更新する。

## 提出フォーム英文版（そのまま貼れる形・2026-08-25）

**Inspiration**

Thirty years of building PCs — every machine since Windows 95 hand-assembled, never
store-bought — and the same scene on repeat: people paying for performance they will
never feel, while overlooking the one cheap part (usually storage) that is actually
holding them back. Every configurator on the internet stands on the overselling side.
Nobody had built the tool that argues the other way.

**What it does**

You snip two screens Windows already has — Settings › About and the drive optimizer —
paste them in, and say what you use the machine for. MOTTAINAI tells you which parts to
keep and for how long, which parts are already far beyond what your use needs, and the
one part, if any, genuinely worth replacing — sized to the need, not to what you own.
For Windows 10 machines it lays out the paths that don't involve buying a new computer.
The answer it is most pleased to reach is ¥0.

**How I built it**

Google ADK (TypeScript) runs two perception agents concurrently — one reads the
hardware from the images, one interprets the workload — and they join exactly once
into a deterministic judgment engine. No model touches a verdict or a price:
core/verdict.js is plain tested code, 127 assertions. Gemini 3.7 Flash does the two
jobs models are good at — reading images and putting a finished result into words —
and the narrator is forbidden from introducing a number the engine did not produce.
Deployed on Cloud Run.

**Challenges we ran into**

ADK's static graph fires a downstream node once per incoming edge, so joining two
perception agents without running the merge twice took `dynamicEntry`. The harder
class of bug was my own code lying with money: an early version printed "solved for
free" while quietly needing ¥15,800 of RAM, and a later one asserted TPM state it had
never read. Both are now guarded by tests that fail if a headline overclaims.

**Accomplishments that we're proud of**

A tool that recommends *not* buying — no affiliate links, no product placement, no
place for them. 5,948 CPUs and 3,013 GPUs looked up against Microsoft's actual
Windows 11 support lists, with `null` answers that stay `null` and say why, instead
of interpolated guesses.

**What we learned**

Deciding in advance what the model is *not allowed* to decide turned out to be the
center of the design. Everything that touches money runs in ordinary code that a test
can pin down.

**What's next**

Laptop-specific judgment (screen, camera, battery — the parts this version deliberately
left out), keeping the price data fresh, and running it as a permanent site.

## まだ残っている正直な穴

- ゲームの必要スペックが公式サイトの403とJS描画で未取得（現状は編集判断であることを画面に明示）
- DaVinci Resolve の数値は中信頼（PDFの本文を直接読めていない）
- 価格の観測日が2026-08-24。時間が経つと古くなる性質のデータ
