# GitHub Pages 銀行・支店検索ページ 実装計画

- ステータス: draft
- 作成日: 2026-08-16
- 種別: 計画整理のみ（実装しない）

本ドキュメントは、既存の Slack Slash Command `/zengin` の検索仕様を踏襲した
GitHub Pages 上の Web 検索ページを将来実装するための計画です。
現時点では**実装を行わず、TODO として整理**することを目的とします。

---

## 1. Goal

Web ブラウザ上で、誰でも簡単に以下を検索できるページを作る。

- 銀行名 → 銀行情報
- 銀行コード → 銀行情報
- 銀行 + 支店名 → 支店候補
- 銀行 + 支店コード → 支店情報

既存の Slack `/zengin` と**できるだけ検索仕様を共通化**することを目標とする。
具体的には、共通データ（全銀 JSON）を使い、検索ロジックの二重実装を最小化する。

---

## 2. Current implementation

現在の検索仕様は、本リポジトリの以下コードから確認できる。

- ライブラリ: `lib/Zengin/Pl.pm` の `search()` / `get_bank()` / `get_branch()`
- CLI ラッパー: `lib/Zengin/Pl/CLI.pm`（`script/zengin`）
- Slack Slash Command 自体の実装は本リポジトリ**外**（呼び出し側）。
  `docs/README.pod` では `zengin-pl-api` 等が `meta()` を利用する前提が記載されている。
  したがって検索仕様の正はここではなく上記のライブラリ/CLI にある。

### 引数ディスパッチ（`Zengin::Pl::CLI.pm`）

| 引数 | 条件 | 動作 |
|---|---|---|
| 1 引数 = 数字のみ | `\A\d+\z` | `get_bank` による完全一致（コード lookup） |
| 2 引数 = 両方数字 | $argv[0], $argv[1] とも数字 | `get_branch` による完全一致 |
| 1 引数 | 上記以外 | 銀行検索 `search($bank_pat)` |
| 2 引数 | 上記以外 | 銀行で絞り込み → 各銀行内で支店検索 |

### 検索語の扱い（重要）

- 銀行検索: `name` / `kana` / `hira` / `code` のいずれかに対し、リテラル部分一致（`\Q...\E`）。
  （`lib/Zengin/Pl.pm` 行 130-136、`Zengin::Pl::CLI.pm` `_matches`）
- 支店検索: 同様に `name` / `hira` / `kana` / `code` の部分一致。
- `roma` フィールドはデータ上に存在するが、**現行の検索対象には入っていない**。
- 完全一致の特別扱いは「数字のみの引数」の case のみに存在。
  それ以外は常に部分一致（substring）。
- 横断検索: 「銀行名で絞り込んでから支店を検索」する 2 段階。全銀行を横断して支店名だけを
  引くモードは**存在しない**。1 引数のみでは銀行まで。
- 複数候補時: ヒットした銀行を全て返す。並びは `bank code` 昇順
  （`_sort_banks`）、支店は `branch code` 昇順（CLI）。ライブラリ `search()` 側は並び順を保証しない。
- 0 件: CLI は `not found` を標準出力に表示、終了コード 0。
- 正規表現: ライブラリ `search()` は qr オブジェクトも受けるが（`t/03.search.t`）、CLI は文字列のみ渡す。
- Windows の `cp932` デコード対応は CLI 固有（Web では不要）。

補足:
- 支店検索結果は CLI では `bank_code` と支店レコードの組。ライブラリ `search($bank,$branch)` は
  支店レコードのみ（`bank_code` 非含）。表示時の銀行名補完は呼び出し側の責務。

---

## 3. GitHub Pages architecture

GitHub Pages は静的サイトのみ配信できるため、**server-side backend を持たない構成**を第一候補にする。

### 推奨構成（MVP）

```
web/                    … ビルド生成物（GitHub Pages の公開 root）
  index.html            … SPA 検索フォーム
  app.js                … 検索ロジック + UI 操作
  style.css
  data/
    banks.json          … banks.json を整形（必要なら軽量化）
    branches/{code}.json … 支店 JSON（必要銀行分のみ）
    meta.json           … updated_at / revision を記録（表示用）
```

- 検索はすべてブラウザ側 JS で行う（サーバー不要、secrets 不要）。
- `zengin-data-mirror` をビルド時に取得して上記 JSON を生成する。
  - banks.json（約 200KB）、支店 1000 ファイル。
  - 全支店 JSON を無条件生成するか、銀行コードが参照時のみ生成するか、MVP で要判断。
  - データ量が大きい場合は、銀行ごとに軽量化（出力項目を絞る）も選択肢。

### 共通データ / 共通ロジック

- データのソースは mirror を **単一の正** にし、Web 用 JSON はここから**生成**する（手二重管理を避ける）。
- 検索ロジックは Perl（`Zengin::Pl`/`CLI`）と JS で実装が揃うため、二重実装が避けられない部分がある。
  対処案:
  1. 検索の**仕様書**を本計画ドキュメントに記載し、JS はそれに追従（テストで検証）。
  2. `t/` に「同一 query corpus で Perl 版と JS 版の結果が一致する」回帰テストを追加。
     - 例: `t/data/search_corpus.json`（query × 期待結果）を生成し、Perl 版がその出力を出すこと
       を Perl テストで確認、JS 版は同じ corpus を食わせて Node（GitHub Actions）で確認。
  3. より大掛かりだが、Perl で正規化した中間 JSON（検索用インデックス）を生成し、
     JS はそれを参照するだけにする方式も将来候補。

### ランタイムで mirror を直接叩く代替案（非推奨）

- GitHub Pages は CORS 制約があり、`raw.githubusercontent.com` は全体で許可されているので
  直接fetchは可能。ただし更新タイミング・オフライン・帯域・rate limit を自前管理する必要が
  あり、ビルド時 JSON 生成のほうがシンプルとみなし非推奨とする。

---

## 4. URL / page structure

### MVP

- 単一ページ SPA
  - `/` : サービス説明 + 検索フォーム
  - 状態はクエリパラメータ（例: `/?bank=みずほ&branch=東京`）で持たせ、リロード/共有を可能にする。

### 将来（SEO・共有 URL 価値がある場合）

| URL 例 | 内容 |
|---|---|
| `/` | サービス説明 / 検索フォーム |
| `/bank/0001/` | みずほ銀行の静的ページ |
| `/bank/0001/branch/001/` | 東京営業部の静的ページ |

- 生成量: 銀行約 1,000・支店は数万件になるため、支店全ページの静生成は重い。
  人気銀行のみ・検索経由での逐次生成など、フェーズ分けが必要。

---

## 5. Search UI

### MVP（最低限）

- 銀行検索入力欄（銀行名 / 銀行コード）
- 支店検索入力欄（支店名 / 支店コード、任意）
- 検索ボタン
- 候補表示（複数候補はリスト表示、銀行コード昇順）
- 0 件時表示（CLI 同様 `not found` 相当のメッセージ）
- コード検索（数字のみ入力時は現行 CLI と同じく完全一致 lookup）
- 日本語表示（name / hira / kana / roma）

### 将来候補（MVP には含めない）

- 入力中の候補表示（autocomplete）
- 結果コピー ボタン（銀行コード / 支店コード）
- URL 共有ボタン
- 最近の検索（localStorage）
- 人気検索（オンライン統計と連動）

---

## 6. Display fields

`zengin-data-mirror` のデータに存在する項目のみを表示対象とする。

### 銀行（`data/banks.json`）

- `code` … 銀行コード
- `name` … 銀行名（例: 「みずほ」。末尾に「銀行」を付加しないデータ）
- `kana` … 全角カタカナ相当
- `hira` … hiragana
- `roma` … ローマ字

### 支店（`data/branches/{code}.json`）

- `code` … 支店コード
- `name` … 支店名
- `hira` / `kana` / `roma` … 上記と同様

推測で項目を追加しない。親銀行の `code` / `name` は支店表示に使う（検索時に結合）。

---

## 7. Data update

元データ: `sironekotoro/zengin-data-mirror`（`main`, `data/`）
- `banks.json`, `branches/{code}.json`, `updated_at`, `revision`, `md5`

更新フロー（Web 版 JSON を手動で二重管理しない設計）

1. mirror に新しい `updated_at` が出る
2. （手動 or CI）mirror から取得して `web/data/` を再生成
3. テスト（検索 corpus の回帰）
4. Pages へ deploy（GitHub Pages 用の publish ブランチ / `actions` を更新）

### 更新手段の候補

| 方法 | 説明 |
|---|---|
| 手動 | `perl` の生成スクリプトを `tools/` か `web/` 付近に置き、commit して push |
| GitHub Actions (schedule) | 既存 `update-google-sheet.yml` と同様に `updated_at` を state（`.github/state/` を想定）で比較して変更時のみ commit |
| push 連動 | mirror の更新を検知して push（更新検知は schedule workflow が現実的） |

データ更新頻度: mirror の更新頻度（zengin-code/source-data の運用次第、直近は月〜日単位）。
自動更新の判断は「`updated_at` の変化」で行うのが確実。

---

## 8. Access analytics （将来フェーズ、MVP 外）

GitHub Pages だけでは server 側ログが取れないため、クライアントサイド計測を検討。

知りたいもの:
- ページビュー
- 人気の銀行 / 支店
- 検索件数・0 件検索・検索キーワード傾向
- 銀行コード検索 vs 名前検索比率

プライバシー方針（必須）:
- 生の検索文字列を無期限保存しない
- IP アドレス等を不要に収集しない
- 必要最小限の匿名統計（例えばハッシュ化 or 切り捨て・上位 N 件のカウントのみ）を優先

将来候補の手段:
- Cloudflare Web Analytics（シンプルに PV と参照元）
- Google Analytics（詳細分析）
- 軽量な自前イベント収集（例: 自前の計測エンドポイント）

MVP には含めない。

---

## 9. Visualization（将来フェーズ、MVP 外）

「アクセスログを見て楽しいページ」を目的とした、admin/developer 向け統計ビュー。

- 今日の検索件数
- 人気銀行ランキング
- 人気支店ランキング
- 検索時間帯
- 0 件検索ランキング
- 銀行コード検索 vs 名前検索の割合

統計データに検索傾向・アクセス傾向が含まれるため、そのまま GitHub 上に静的に公開すると
外部に公開されてしまう。非公開化（private / 認証）や公開範囲の設計が別途必要。

---

## 10. Monetization（将来候補）

- 銀行口座 / クレジットカード / 証券 / FX / 法人口座 / 金融関連サービス のアフィリエイト等

方針（計画書内で固定）:
- 検索結果より広告を優先しない
- 銀行コード・支店コード検索の正確性を損なわない
- 広告と検索結果を明確に区別する（ラベル・デザイン）
- 金融商品について誤解を招く表現を避ける

- 具体の広告サービス申込・実装は行わない。
- MVP には一切含めない。

---

## 11. SEO / structured data（将来）

個別銀行ページ・支店ページを作る場合の候補:

- `title` / `description`（銀行名・コードを含む）
- `canonical`
- `sitemap.xml`
- structured data（`Organization` / `FinancialService` 系を検討）
- 銀行コード / 支店コードを含む静的ページ
- 検索エンジンから直接対象銀行・支店に到達できる構成

- MVP では必須にしない。

---

## 12. MVP

最初の実装範囲を以下に限定する。

1. GitHub Pages を有効化
2. 銀行・支店データを静的 JSON として生成（ビルド時）
3. 単一ページの検索フォーム
4. 銀行名 / 銀行コード検索
5. 銀行内の支店名 / 支店コード検索
6. Slack 版と主要検索結果が一致することをテスト
7. GitHub Pages へ deploy

後続（MVP 後に分離）:
- Analytics / 可視化
- SEO 個別ページ
- アフィリエイト
- autocomplete など高度 / UI

---

## 13. Acceptance criteria

MVP 完成条件:

- [ ] GitHub Pages で検索ページが表示できる
- [ ] 銀行名検索ができる
- [ ] 銀行コード検索ができる
- [ ] 支店名検索ができる
- [ ] 支店コード検索ができる（銀行を絞り込んだ上で）
- [ ] Slack 版と代表ケース（corpus）の結果が一致する
- [ ] 0 件 / 複数件が正しく表示される
- [ ] スマートフォンでも最低限利用可能（レスポンシブの最小対応）
- [ ] 元データ更新時に Web 用 JSON を再生成できる
- [ ] secrets 不要で静的に公開できる

---

## 14. Parent / child TODO

### Parent

**Add GitHub Pages bank and branch search**

### Child candidates

| TODO | 説明 | status |
|---|---|---|
| Inspect and extract reusable search logic | `/zengin` の検索仕様をライブラリ/CLI から抽出し、Web 用参照仕様とする | planned |
| Generate static bank/branch search data | mirror → `web/data/*.json`（+ `meta.json`）生成 | planned |
| Build GitHub Pages search MVP | index.html + app.js + style.css（SPA 検索フォーム） | planned |
| Add regression tests against Slack search | 検索 corpus で Perl 版 vs JS 版の一致テスト | planned |
| Configure GitHub Pages deployment | Pages ブランチ設定 + デプロイ workflow（または Actions で deploy） | planned |
| Add search analytics | 匿名統計収集（要件と privacy 方針は #8） | backlog |
| Add analytics visualization | 統計ページ / ランキング（#9） | backlog |
| Add SEO-friendly bank/branch pages | 静的個別ページ + structured data（#11） | backlog |
| Evaluate monetization | アフィリエイト等の許容範囲確認（#10） | backlog |

`status` は実装フェーズが動いたら更新する。管理方法は本リポジトリに既存の TODO アプリが
ないため、本ドキュメントまたは GitHub Issues で管理する案を将来検討。

---

## 15. Out of scope

本計画整理では以下を**実装しない**。

- GitHub Pages 有効化
- HTML / JavaScript 実装
- データ生成処理
- GitHub Actions 追加
- Analytics 導入
- アフィリエイト導入
- Slack 版の仕様変更
- API サーバー構築

---

## Notes / Future considerations

今後実装時に検討すべき気づき:

1. **`roma` 検索対象外**: データには `roma` が存在するが、現行の検索（`name/kana/hira/code`）には
   含まれない。ローマ字検索を Web で入れるかは、Slack 版や CLI と揃えるか予想で決めず承認が必要。
2. **銀行名の表記**: mirror の `name` は「みずほ」等、`銀行` の語を含まない。
   配布 README / CLI テストのモックでは「みずほ銀行」表記で、実データとズレがある。
   Slack 表示がどちらを採用しているか確認したうえで Web の表示フォーマットを合わせる。
3. **CLI の並び順**と、ライブラリ `search()` の並び順が非保証。Web 実装では並び順を明示的に定める。
4. **検索の二重実装**: JS 化の際に部分一致の大文字/小文字（roma）・全角数字・
    カナ/ひらがなの正規化は Perl と JS で挙動が変わりやすい。corpus 回帰テストを強く推奨。
5. **CORS の制約**: 配布物は Pages 経由（同オリジン）で JSON を配る前提にする。
6. **ブランチ名 / 公開 root**: `gh-pages` ブランチ or `docs/` ディレクトリ or `main` 直下かは決定保留。
    Pages の更新手段（Actions での deploy 等）と配布物分離の判断を実装フェーズで行う。