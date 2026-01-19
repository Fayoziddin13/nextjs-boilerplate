"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type ResultItem = {
  title: string;
  subtitle: string;
  url: string;
  source: "Instagram" | "Telegram";
};

const IG_SEARCH = (q: string) =>
  `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`;

const TG_SEARCH = (q: string) =>
  `https://t.me/s/${encodeURIComponent(q)}`; // MVP: канал/хабар қидирув ўрнига шунча (кейин яхшилаймиз)

export default function Page() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [tgUser, setTgUser] = useState<TgUser | null>(null);

  const [searchCount, setSearchCount] = useState(0);
  const [needsReg, setNeedsReg] = useState(false);

  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("Toshkent");

  const [trends, setTrends] = useState<{ keyword: string; cnt: number }[]>([]);

  const canSearch = useMemo(() => keyword.trim().length > 1, [keyword]);

  useEffect(() => {
    // Telegram WebApp init
    // @ts-ignore
    const tg = window?.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      const u = tg.initDataUnsafe?.user as TgUser | undefined;
      if (u?.id) setTgUser(u);
    }
  }, []);

  async function loadTrends() {
    const { data, error } = await supabase
      .from("searches")
      .select("keyword")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return;

    const map = new Map<string, number>();
    for (const row of data || []) {
      const k = (row as any).keyword?.toLowerCase?.()?.trim?.();
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }

    const top = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, cnt]) => ({ keyword, cnt }));

    setTrends(top);
  }

  useEffect(() => {
    loadTrends();
  }, []);

  async function ensureUserIfNeeded(): Promise<boolean> {
    // 1-қидирув бепул; 2-қидирувдан кейин регистрация
    if (searchCount < 1) return true;

    // Агар tgUser бўлмаса ҳам регистрация талаб қиламиз
    if (!tgUser?.id) {
      setNeedsReg(true);
      return false;
    }

    // DB'да user борми?
    const tid = String(tgUser.id);
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", tid)
      .maybeSingle();

    if (error) {
      setNeedsReg(true);
      return false;
    }

    if (!data?.id) {
      setNeedsReg(true);
      return false;
    }

    return true;
  }

  async function saveSearch(platform: string) {
    // searches таблицада user_id uuid references users(id) — сенда UUID вариантда яратилган.
    // Биз ҳозирча user_id'ни NULL қилиб сақлаймиз (регистрациядан кейин тугаймиз).
    const { error } = await supabase.from("searches").insert({
      keyword: keyword.trim(),
      platform,
    });

    // error бўлса ҳам MVP'да натижани кўрсатаверамиз
    void error;
  }

  async function onSearch() {
    if (!canSearch) return;

    const ok = await ensureUserIfNeeded();
    if (!ok) return;

    const q = keyword.trim();

    const items: ResultItem[] = [
      {
        title: "Instagram натижалар",
        subtitle: `“${q}” бўйича`,
        url: IG_SEARCH(q),
        source: "Instagram",
      },
      {
        title: "Telegram натижалар",
        subtitle: `“${q}” бўйича`,
        url: TG_SEARCH(q),
        source: "Telegram",
      },
    ];

    setResults(items);

    // DB'га сақлаш (MVP)
    await saveSearch("instagram");
    await saveSearch("telegram");

    setSearchCount((c) => c + 1);
    loadTrends();
  }

  async function onRegister() {
    if (!tgUser?.id) return;

    const tid = String(tgUser.id);

    // users таблица UUID вариантда: id uuid, telegram_id unique.
    // Шундай бўлса, id'ни автомат (gen_random_uuid) қилади, биз telegram_id'ни қўйамиз.
    const { error } = await supabase.from("users").insert({
      telegram_id: tid,
      phone: phone.trim() || null,
      first_name: tgUser.first_name || null,
      location: location || null,
    });

    if (!error) {
      setNeedsReg(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system" }}>
      <h2 style={{ margin: 0 }}>Topic</h2>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Instagram ва Telegram’да ҳозир нима бўляпти — 1 та калит сўз билан топинг.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Мавзу, шахс ёки жойни ёзинг…"
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            color: "inherit",
          }}
        />
        <button
          onClick={onSearch}
          disabled={!canSearch}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: canSearch ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
            color: "inherit",
          }}
        >
          Қидириш
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {results.map((r) => (
            <a
              key={r.source}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
                padding: 14,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                textDecoration: "none",
                color: "inherit",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontWeight: 700 }}>{r.title}</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>{r.subtitle}</div>
              <div style={{ opacity: 0.6, marginTop: 8, fontSize: 12 }}>
                Манба: {r.source} → очиш
              </div>
            </a>
          ))}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <h3 style={{ marginBottom: 8 }}>🔥 Bugun trend</h3>
        {trends.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Ҳали маълумот йўқ</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {trends.map((t) => (
              <div
                key={t.keyword}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <span>{t.keyword}</span>
                <span style={{ opacity: 0.75 }}>{t.cnt}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {needsReg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 16,
              padding: 16,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              Давом этиш учун рўйхатдан ўтинг
            </div>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              1 дақиқа. Кейин сизга мос трендлар чиқади.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон (ихтиёрий)"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "inherit",
                }}
              />

              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "inherit",
                }}
              >
                <option value="Toshkent">Toshkent</option>
                <option value="Samarqand">Samarqand</option>
                <option value="Buxoro">Buxoro</option>
                <option value="Andijon">Andijon</option>
                <option value="Farg'ona">Farg'ona</option>
                <option value="Namangan">Namangan</option>
              </select>

              <button
                onClick={onRegister}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.12)",
                  color: "inherit",
                  fontWeight: 700,
                }}
              >
                Рўйхатдан ўтиш
              </button>

              <button
                onClick={() => setNeedsReg(false)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "transparent",
                  color: "inherit",
                  opacity: 0.8,
                }}
              >
                Кейинроқ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
