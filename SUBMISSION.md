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
| 期間中に新規作成 | 2026-08-24 着手・全て新規 | ✅ |

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
> ⚠ 判定は15〜35秒かかる（Gemini側のテール遅延）。**待ちは録画でカットして
> 「動き出し2〜3秒 → ジャンプ → 結果」でつなぐ**。リアルタイムで待たせない。

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

**[2:50–3:15] 設計の芯**

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
- 判定は15〜35秒。録画は待ちカット前提で構成する

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

## まだ残っている正直な穴

- ゲームの必要スペックが公式サイトの403とJS描画で未取得（現状は編集判断であることを画面に明示）
- DaVinci Resolve の数値は中信頼（PDFの本文を直接読めていない）
- 価格の観測日が2026-08-24。時間が経つと古くなる性質のデータ
