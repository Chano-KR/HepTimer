"use client";

import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type Category = {
  id: string;
  name: string;
  color?: string;
};

type Session = {
  id: string;
  categoryId: string | null;
  plannedMinutes: number;
  actualSeconds: number;
  startedAt: Date;
  endedAt: Date;
  status: "completed" | "canceled";
};

type HeatmapCell = {
  date: Date;
  minutes: number;
  label?: string;
};

type StatsMode = "day" | "week" | "month";

const presets = [25, 30, 50];
const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const months = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const initialCategories: Category[] = [
  { id: "study", name: "공부", color: "#8f1d2c" },
  { id: "coding", name: "코딩", color: "#0066ff" },
  { id: "reading", name: "독서", color: "#00bf40" },
];

const sampleSessions: Session[] = Array.from({ length: 74 }, (_, index) => {
  const endedAt = new Date();
  endedAt.setDate(endedAt.getDate() - index);
  endedAt.setHours(21 - (index % 6), 10, 0, 0);

  return {
    id: `sample-${index}`,
    categoryId: initialCategories[index % initialCategories.length].id,
    plannedMinutes: presets[index % presets.length],
    actualSeconds: (index % 4 === 0 ? 50 : presets[index % presets.length]) * 60,
    startedAt: new Date(endedAt.getTime() - presets[index % presets.length] * 60000),
    endedAt,
    status: index % 4 === 0 ? "canceled" : "completed",
  };
});

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayFirstDay(date: Date) {
  return (date.getDay() + 6) % 7;
}

function weekStartKey(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - mondayFirstDay(start));
  return dateKey(start);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function getHeatmapCellColor(minutes: number, baseColor = "#8f1d2c") {
  if (minutes === 0) {
    return { backgroundColor: "#f1f2f3", color: "#989ba2" };
  }

  let opacity = "20"; // ~12% opacity in hex
  let textColor = "#171719";

  if (minutes >= 100) {
    opacity = "ff";
    textColor = "#ffffff";
  } else if (minutes >= 50) {
    opacity = "b3"; // 70% opacity
    textColor = "#ffffff";
  } else if (minutes >= 25) {
    opacity = "73"; // 45% opacity
  }

  return {
    backgroundColor: `${baseColor}${opacity}`,
    color: textColor,
  };
}

function playChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime + startOffset);
      gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + startOffset + 0.05); // Attack
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration); // Decay
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    // Soft Burgundy-themed chime: C5 (523.25 Hz) then E5 (659.25 Hz)
    playTone(523.25, 0, 0.5);
    playTone(659.25, 0.22, 0.7);
  } catch (error) {
    console.error("Audio playback failed:", error);
  }
}

function sendNotification(categoryName: string, minutes: number) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  
  if (Notification.permission === "granted") {
    try {
      new Notification("HepTimer.", {
        body: `${categoryName} 카테고리의 ${minutes}분 집중 세션이 완료되었습니다!`,
        icon: "/favicon.ico",
      });
    } catch (e) {
      console.error("Notification failed:", e);
    }
  }
}

function isSessionInSelectedDate(session: Session, selectedDate: string | null) {
  if (!selectedDate) return true;
  if (selectedDate.startsWith("month-")) {
    return monthKey(session.endedAt) === selectedDate.replace("month-", "");
  }
  if (selectedDate.startsWith("week-")) {
    return weekStartKey(session.endedAt) === selectedDate.replace("week-", "");
  }
  return dateKey(session.endedAt) === selectedDate;
}

export function FocusTimerApp() {
  const didExchangeAuthCode = useRef(false);
  const supabase = useMemo(
    () => (isSupabaseConfigured ? createSupabaseBrowserClient() : null),
    [],
  );
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("study");
  const [categories, setCategories] = useState(initialCategories);
  const [sessions, setSessions] = useState(sampleSessions);
  const [newCategory, setNewCategory] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [statsMode, setStatsMode] = useState<StatsMode>("day");
  
  // 추가된 상태 변수들
  const [newCategoryColor, setNewCategoryColor] = useState("#8f1d2c");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const heatmapContainerRef = useRef<HTMLDivElement>(null);

  // 알림 설정 상태 및 임시 상태
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("heptimer_sound");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [isNotificationEnabled, setIsNotificationEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("heptimer_notif");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [tempSound, setTempSound] = useState(true);
  const [tempNotification, setTempNotification] = useState(true);

  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ??
    categories[0];

  const startTimer = useCallback(() => {
    setIsRunning(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default" && isNotificationEnabled) {
        Notification.requestPermission();
      }
    }
  }, [isNotificationEnabled]);

  // 설정 저장
  const saveSettings = useCallback(() => {
    setIsSoundEnabled(tempSound);
    setIsNotificationEnabled(tempNotification);
    localStorage.setItem("heptimer_sound", String(tempSound));
    localStorage.setItem("heptimer_notif", String(tempNotification));
    
    if (tempNotification && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
    setIsSettingsOpen(false);
  }, [tempSound, tempNotification]);

  const loadFocusData = useCallback(
    async (currentUser: User) => {
      if (!supabase) {
        return;
      }

      setIsSyncing(true);
      const { data: categoryRows, error: categoryError } = await supabase
        .from("focus_categories")
        .select("id,name,color")
        .order("created_at", { ascending: true });

      if (categoryError) {
        setAuthMessage(categoryError.message);
        setIsSyncing(false);
        return;
      }

      let nextCategories =
        categoryRows?.map((category) => ({
          id: category.id as string,
          name: category.name as string,
          color: category.color as string,
        })) ?? [];

      if (nextCategories.length === 0) {
        const { data: seededCategories, error: seedError } = await supabase
          .from("focus_categories")
          .insert(
            initialCategories.map((category) => ({
              user_id: currentUser.id,
              name: category.name,
              color: category.color || "#8f1d2c",
            })),
          )
          .select("id,name,color");

        if (seedError) {
          setAuthMessage(seedError.message);
          setIsSyncing(false);
          return;
        }

        nextCategories =
          seededCategories?.map((category) => ({
            id: category.id as string,
            name: category.name as string,
            color: category.color as string,
          })) ?? [];
      }

      const { data: sessionRows, error: sessionError } = await supabase
        .from("focus_sessions")
        .select("id,category_id,planned_minutes,actual_seconds,started_at,ended_at,status")
        .order("ended_at", { ascending: false })
        .limit(500);

      if (sessionError) {
        setAuthMessage(sessionError.message);
        setIsSyncing(false);
        return;
      }

      setCategories(nextCategories);
      setSelectedCategoryId(nextCategories[0]?.id ?? "");
      setSessions(
        sessionRows?.map((session) => ({
          id: session.id as string,
          categoryId: session.category_id as string | null,
          plannedMinutes: session.planned_minutes as number,
          actualSeconds: session.actual_seconds as number,
          startedAt: new Date(session.started_at as string),
          endedAt: new Date(session.ended_at as string),
          status: session.status as "completed" | "canceled",
        })) ?? [],
      );
      setIsSyncing(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let mounted = true;

    async function initializeAuth() {
      if (!mounted) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const authCode = params.get("code");
      const authError = params.get("error_description") ?? params.get("error");

      if (authError) {
        setAuthMessage(authError);
      }

      if (authCode && !didExchangeAuthCode.current) {
        didExchangeAuthCode.current = true;
        const { error } = await client.auth.exchangeCodeForSession(authCode);

        if (error) {
          setAuthMessage(error.message);
        } else {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      const { data } = await client.auth.getSession();
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await client.from("profiles").upsert({
          id: currentUser.id,
          email: currentUser.email,
        });
        await loadFocusData(currentUser);
      }
    }

    initializeAuth();

    const { data: listener } = client.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          await client.from("profiles").upsert({
            id: currentUser.id,
            email: currentUser.email,
          });
          await loadFocusData(currentUser);
        }
      },
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadFocusData, supabase]);

  const choosePreset = useCallback((minutes: number) => {
    setSelectedMinutes(minutes);
    setRemainingSeconds(minutes * 60);
    setIsRunning(false);
  }, []);

  const saveSession = useCallback(
    async (status: "completed" | "canceled", finalRemainingSeconds: number) => {
      const actualSeconds = selectedMinutes * 60 - finalRemainingSeconds;

      if (actualSeconds < 60) {
        setRemainingSeconds(selectedMinutes * 60);
        setIsRunning(false);
        return;
      }

      const endedAt = new Date();
      const startedAt = new Date(endedAt.getTime() - actualSeconds * 1000);
      const optimisticSession: Session = {
        id: crypto.randomUUID(),
        categoryId: selectedCategoryId || null,
        plannedMinutes: selectedMinutes,
        actualSeconds,
        startedAt,
        endedAt,
        status,
      };

      setSessions((current) => [
        optimisticSession,
        ...current,
      ]);
      setRemainingSeconds(selectedMinutes * 60);
      setIsRunning(false);

      if (status === "completed") {
        if (isSoundEnabled) {
          playChime();
        }
        if (isNotificationEnabled) {
          sendNotification(
            categories.find((c) => c.id === selectedCategoryId)?.name || "미지정",
            selectedMinutes
          );
        }
      }

      if (supabase && user) {
        const { data, error } = await supabase
          .from("focus_sessions")
          .insert({
            user_id: user.id,
            category_id: selectedCategoryId || null,
            planned_minutes: selectedMinutes,
            actual_seconds: actualSeconds,
            started_at: startedAt.toISOString(),
            ended_at: endedAt.toISOString(),
            status,
          })
          .select("id")
          .single();

        if (error) {
          setAuthMessage(error.message);
          return;
        }

        if (data?.id) {
          setSessions((current) =>
            current.map((session) =>
              session.id === optimisticSession.id
                ? { ...session, id: data.id as string }
                : session,
            ),
          );
        }
      }
    },
    [selectedCategoryId, selectedMinutes, categories, isSoundEnabled, isNotificationEnabled, supabase, user],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (supabase && user) {
        const { error } = await supabase
          .from("focus_sessions")
          .delete()
          .eq("id", sessionId);

        if (error) {
          setAuthMessage(error.message);
          return;
        }
      }

      setSessions((current) => current.filter((session) => session.id !== sessionId));
    },
    [supabase, user],
  );

  const renameCategoryLocal = (id: string, name: string) => {
    setCategories((current) =>
      current.map((cat) => (cat.id === id ? { ...cat, name } : cat))
    );
  };

  const saveCategoryName = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (supabase && user) {
      const { error } = await supabase
        .from("focus_categories")
        .update({ name: trimmed })
        .eq("id", id);
      if (error) {
        setAuthMessage(error.message);
      }
    }
  };

  const deleteCategory = async (id: string) => {
    if (categories.length <= 1) {
      setAuthMessage("최소 하나의 카테고리는 유지되어야 합니다.");
      return;
    }

    if (supabase && user) {
      const { error } = await supabase
        .from("focus_categories")
        .delete()
        .eq("id", id);
      if (error) {
        setAuthMessage(error.message);
        return;
      }
    }

    if (selectedCategoryId === id) {
      const remaining = categories.filter((cat) => cat.id !== id);
      setSelectedCategoryId(remaining[0]?.id || "");
    }

    setCategories((current) => current.filter((cat) => cat.id !== id));
    setSessions((current) =>
      current.map((sess) => (sess.categoryId === id ? { ...sess, categoryId: null } : sess))
    );
  };

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          setIsRunning(false);
          saveSession("completed", 0);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, saveSession]);

  const completedToday = useMemo(() => {
    const today = dateKey(new Date());
    let filtered = sessions;
    if (filterCategoryId) {
      filtered = filtered.filter((session) => session.categoryId === filterCategoryId);
    }
    return filtered
      .filter((session) => dateKey(session.endedAt) === today)
      .reduce((total, session) => total + session.actualSeconds, 0);
  }, [sessions, filterCategoryId]);

  const heatmapWeekCount =
    statsMode === "month" ? 32 : statsMode === "week" ? 20 : 16;
  const heatmapTitle =
    statsMode === "month"
      ? "Last 8 months"
      : statsMode === "week"
        ? "Last 20 weeks"
        : "Last 16 weeks";
  const barTitle =
    statsMode === "month"
      ? "Last 12 months"
      : statsMode === "week"
        ? "Last 8 weeks"
        : "Last 7 days";

  const heatmapWeeks = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + (6 - mondayFirstDay(end)));

    let filtered = sessions;
    if (filterCategoryId) {
      filtered = filtered.filter((session) => session.categoryId === filterCategoryId);
    }

    return Array.from({ length: heatmapWeekCount }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex): HeatmapCell => {
        const date = new Date(end);
        date.setDate(
          end.getDate() - weekIndex * 7 - (6 - dayIndex),
        );

        const minutes = Math.round(
          filtered
            .filter((session) => dateKey(session.endedAt) === dateKey(date))
            .reduce((total, session) => total + session.actualSeconds, 0) / 60,
        );

        return {
          date,
          minutes,
          label:
            date.getDate() <= 7 && dayIndex === 6
              ? months[date.getMonth()]
              : undefined,
        };
      }),
    );
  }, [heatmapWeekCount, sessions, filterCategoryId]);

  const statsSummary = useMemo(() => {
    let filtered = sessions;
    if (filterCategoryId) {
      filtered = filtered.filter((s) => s.categoryId === filterCategoryId);
    }
    
    const now = new Date();
    const today = dateKey(now);
    
    if (statsMode === "day") {
      const todaySessions = filtered.filter((s) => dateKey(s.endedAt) === today);
      const totalSeconds = todaySessions.reduce((sum, s) => sum + s.actualSeconds, 0);
      return {
        totalSeconds,
        sessionCount: todaySessions.length,
      };
    } else if (statsMode === "week") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekSessions = filtered.filter((s) => s.endedAt >= sevenDaysAgo);
      const totalSeconds = weekSessions.reduce((sum, s) => sum + s.actualSeconds, 0);
      return {
        totalSeconds,
        sessionCount: weekSessions.length,
      };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const monthSessions = filtered.filter((s) => s.endedAt >= thirtyDaysAgo);
      const totalSeconds = monthSessions.reduce((sum, s) => sum + s.actualSeconds, 0);
      return {
        totalSeconds,
        sessionCount: monthSessions.length,
      };
    }
  }, [sessions, filterCategoryId, statsMode]);

  function formatTotalTime(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  }

  const summaryBars = useMemo(() => {
    let filtered = sessions;
    if (filterCategoryId) {
      filtered = filtered.filter((session) => session.categoryId === filterCategoryId);
    }

    if (statsMode === "month") {
      return Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (11 - index));
        const key = monthKey(date);
        const minutes = Math.round(
          filtered
            .filter((session) => monthKey(session.endedAt) === key)
            .reduce((total, session) => total + session.actualSeconds, 0) / 60,
        );

        return {
          label: months[date.getMonth()],
          minutes,
          periodKey: `month-${key}`,
        };
      });
    }

    if (statsMode === "week") {
      return Array.from({ length: 8 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (7 - index) * 7);
        const key = weekStartKey(date);
        const minutes = Math.round(
          filtered
            .filter((session) => weekStartKey(session.endedAt) === key)
            .reduce((total, session) => total + session.actualSeconds, 0) / 60,
        );

        return {
          label: `W${index + 1}`,
          minutes,
          periodKey: `week-${key}`,
        };
      });
    }

    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const key = dateKey(date);
        const minutes = Math.round(
          filtered
            .filter((session) => dateKey(session.endedAt) === key)
            .reduce((total, session) => total + session.actualSeconds, 0) / 60,
        );

        return {
          label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
            mondayFirstDay(date)
          ],
          minutes,
          periodKey: key,
        };
      });
  }, [sessions, statsMode, filterCategoryId]);

  async function addCategory() {
    const trimmed = newCategory.trim();

    if (!trimmed) {
      return;
    }

    const id = trimmed.toLowerCase().replace(/\s+/g, "-");
    const category: Category = {
      id: `${id}-${Date.now()}`,
      name: trimmed,
      color: newCategoryColor,
    };

    if (supabase && user) {
      const { data, error } = await supabase
        .from("focus_categories")
        .insert({
          user_id: user.id,
          name: trimmed,
          color: newCategoryColor,
        })
        .select("id,name,color")
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }

      category.id = data.id as string;
      category.name = data.name as string;
      category.color = data.color as string;
    }

    setCategories((current) => [...current, category]);
    setSelectedCategoryId(category.id);
    setNewCategory("");
  }

  async function signInWithPassword() {
    if (!supabase || !email.trim() || !password) {
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setAuthMessage(error ? error.message : "");
  }

  async function signUpWithPassword() {
    if (!supabase || !email.trim() || password.length < 6) {
      setAuthMessage("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setAuthMessage(
      error
        ? error.message
        : "계정을 만들었습니다. 이메일 확인이 켜져 있으면 확인 후 로그인하세요.",
    );
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setCategories(initialCategories);
    setSessions(sampleSessions);
    setSelectedCategoryId("study");
    setAuthMessage("");
  }

  const totalSeconds = selectedMinutes * 60;
  const elapsedSeconds = totalSeconds - remainingSeconds;
  const progress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;

  let motionMode: "crawl" | "walk" | "run" = "crawl";
  if (progress > 0.33 && progress <= 0.66) {
    motionMode = "walk";
  } else if (progress > 0.66) {
    motionMode = "run";
  }

  const timeStr = formatTime(remainingSeconds);
  const colonIndex = timeStr.indexOf(":");
  const minutesPart = timeStr.slice(0, colonIndex);
  const secondsPart = timeStr.slice(colonIndex + 1);

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 text-[#171719] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl rounded-[14px] border border-[#d9dade] bg-white shadow-[0_16px_24px_0_#17171714,0_6px_10px_0_#1717170f]">
        
        {/* Header Section */}
        <header className="px-6 pt-6 pb-5 lg:px-8 lg:pt-8 border-b border-[#d9dade] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-[36px] font-newsreader font-bold leading-[1.2] tracking-[-0.02em]">
              HepTimer<span className="text-[#8f1d2c]">.</span>
            </h1>
          </div>
          
          <div className="flex flex-col items-stretch md:items-end gap-1 w-full md:w-auto">
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 text-center md:text-right w-full">
              {isSupabaseConfigured ? (
                user ? (
                  <div className="flex items-center justify-center md:justify-end gap-3 w-full">
                    <span className="text-[14px] text-[#37383c9c] font-medium max-w-[200px] truncate">
                      {isSyncing ? "Syncing..." : user.email}
                    </span>
                    <button
                      onClick={signOut}
                      className="h-10 rounded-[14px] border border-[#c8cacf] bg-white px-4 text-[13px] font-medium text-[#171719] hover:bg-[#f7f7f8] transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 w-full">
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="email@example.com"
                      className="h-10 w-full sm:w-[160px] rounded-[14px] border border-[#c8cacf] bg-white px-3 text-[13px] outline-none focus:border-[#8f1d2c]"
                    />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="password"
                      type="password"
                      className="h-10 w-full sm:w-[110px] rounded-[14px] border border-[#c8cacf] bg-white px-3 text-[13px] outline-none focus:border-[#8f1d2c]"
                    />
                    <div className="flex gap-1.5 w-full sm:w-auto">
                      <button
                        onClick={signInWithPassword}
                        className="h-10 flex-1 sm:flex-initial rounded-[14px] bg-[#8f1d2c] px-3.5 text-[13px] font-semibold text-white hover:bg-[#731624] transition-colors"
                      >
                        Sign in
                      </button>
                      <button
                        onClick={signUpWithPassword}
                        className="h-10 flex-1 sm:flex-initial rounded-[14px] border border-[#c8cacf] bg-white px-3.5 text-[13px] font-medium hover:bg-[#f7f7f8] transition-colors"
                      >
                        Sign up
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <span className="text-[13px] text-[#37383c9c] w-full text-center md:text-right">
                  로컬 프리뷰 모드
                </span>
              )}
            </div>
            {authMessage && (
              <p className="text-[12px] text-[#8f1d2c] font-medium mt-1 text-center md:text-right">{authMessage}</p>
            )}
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-8">
          
          {/* Heatmap Section */}
          <section className="flex flex-col justify-between h-full min-w-0">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#d9dade/60] pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-[28px] font-medium leading-[1.36] tracking-[-0.023em] text-[#8f1d2c]">
                      {new Date().getFullYear()}
                    </h2>
                    {/* Sync Status Badge with Blinking Dot next to 2026 */}
                    <div className="flex items-center gap-1.5 px-3 h-8 rounded-[14px] border border-[#d9dade] bg-white text-[12px] font-semibold select-none shadow-[0_1px_2px_0_#17171705]">
                      <span className="relative flex h-2 w-2">
                        {user && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8f1d2c] opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${user ? "bg-[#8f1d2c]" : "bg-[#171719]"}`}></span>
                      </span>
                      <span className={user ? "text-[#8f1d2c]" : "text-[#171719]"}>
                        {user ? "sync" : "sync x"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[16px] text-[#2e2f33e0]">
                    {heatmapTitle} focus heatmap
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <select
                    value={filterCategoryId}
                    onChange={(e) => {
                      setFilterCategoryId(e.target.value);
                      setSelectedDate(null);
                    }}
                    className="h-9 flex-1 sm:flex-initial min-w-[130px] rounded-[14px] border border-[#d9dade] bg-white px-3 text-[13px] font-medium text-[#37383c9c] outline-none focus:border-[#8f1d2c]"
                  >
                    <option value="">전체 카테고리</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center justify-between sm:justify-start gap-1.5 border border-[#d9dade] bg-[#f7f7f8] p-[3px] rounded-[14px] flex-grow sm:flex-grow-0">
                    {(["day", "week", "month"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setStatsMode(mode);
                          setSelectedDate(null);
                        }}
                        className={`h-7 rounded-[11px] px-3 text-[12px] font-semibold transition-all flex-1 sm:flex-initial text-center ${
                          statsMode === mode
                            ? "bg-white text-[#171719] shadow-[0_2px_4px_0_#1717170a]"
                            : "text-[#37383c9c] hover:text-[#171719]"
                        }`}
                      >
                        {mode === "day" ? "Day" : mode === "week" ? "Weekly" : "Monthly"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2.5">
                {/* Day labels on the left of the heatmap */}
                <div className="flex flex-col gap-[6px] pt-[2px] text-[11px] font-semibold text-[#37383c9c] select-none">
                  {weekDays.map((day) => (
                    <span key={day} className="flex h-[28px] items-center pr-1.5">
                      {day}
                    </span>
                  ))}
                </div>

                {/* Scrollable heatmap container */}
                <div ref={heatmapContainerRef} className="overflow-x-auto pb-2 flex-1 scrollbar-thin">
                  <div className="flex gap-[6px] w-max">
                    {heatmapWeeks.map((week, weekIndex) => (
                      <div key={weekIndex} className="flex flex-col gap-[6px] w-[28px] min-w-[28px] max-w-[28px] flex-shrink-0 flex-grow-0">
                        {week.map((day) => {
                          const cellStyle = getHeatmapCellColor(
                            day.minutes,
                            categories.find((c) => c.id === filterCategoryId)?.color || "#8f1d2c"
                          );
                          const isSelected = selectedDate === dateKey(day.date);
                          return (
                            <div key={dateKey(day.date)} className="w-[28px] min-w-[28px] max-w-[28px] h-[28px] flex-shrink-0 flex-grow-0 relative group">
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-[#171719] text-white text-[11px] py-1 px-2 rounded-[6px] whitespace-nowrap z-10 shadow-lg pointer-events-none">
                                {dateKey(day.date)} · {day.minutes}분 집중
                              </div>
                              <button
                                onClick={() => {
                                  const key = dateKey(day.date);
                                  setSelectedDate((prev) => (prev === key ? null : key));
                                }}
                                style={{
                                  ...cellStyle,
                                  border: isSelected ? "2px solid #171719" : "none",
                                }}
                                className="flex w-[28px] min-w-[28px] max-w-[28px] h-[28px] flex-shrink-0 flex-grow-0 items-center justify-center rounded-[4px] text-[10px] font-medium transition-all hover:scale-105"
                              >
                                {day.minutes >= 60 ? day.minutes : ""}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-[6px] w-max">
                    {heatmapWeeks.map((week, index) => {
                      const label = week.find((day) => day.label)?.label;
                      return (
                        <span
                          key={index}
                          className="w-[28px] min-w-[28px] max-w-[28px] flex-shrink-0 flex-grow-0 text-center text-[11px] font-semibold text-[#37383c9c] select-none"
                        >
                          {label || ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-[14px] border border-[#d9dade] bg-[#f7f7f8] p-4 shadow-[0_2px_4px_0_#17171705]">
                <p className="text-[13px] font-medium text-[#37383c9c]">
                  {statsMode === "day" ? "오늘" : statsMode === "week" ? "최근 7일" : "최근 30일"} 총 집중 시간
                </p>
                <p className="mt-1 text-[22px] font-bold text-[#8f1d2c]">
                  {formatTotalTime(statsSummary.totalSeconds)}
                </p>
              </div>
              <div className="rounded-[14px] border border-[#d9dade] bg-[#f7f7f8] p-4 shadow-[0_2px_4px_0_#17171705]">
                <p className="text-[13px] font-medium text-[#37383c9c]">
                  {statsMode === "day" ? "오늘" : statsMode === "week" ? "최근 7일" : "최근 30일"} 총 집중 세션
                </p>
                <p className="mt-1 text-[22px] font-bold text-[#171719]">
                  {statsSummary.sessionCount}회
                </p>
              </div>
            </div>
          </section>

          {/* Timer controls column */}
          <section className="flex flex-col justify-between h-full min-w-0">
            <div className="pt-10">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1 text-[28px] font-medium leading-[1.36] tracking-[-0.023em] text-[#8f1d2c]">
                  <span>{minutesPart}</span>
                  <span className={isRunning ? "opacity-35" : ""}>:</span>
                  <span>{secondsPart}</span>
                  <span
                    className={`w-8 h-8 flex-shrink-0 ml-2 inline-flex items-center justify-center transition-opacity duration-300 ${
                      remainingSeconds < selectedMinutes * 60 ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {motionMode === "crawl" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" style={{ animationPlayState: isRunning ? "running" : "paused" } as React.CSSProperties}>
                        <style>
                          {`
                            .crawl-body {
                              animation: crawl-body-anim 0.8s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .crawl-limb-1 {
                              transform-origin: 8px 14px;
                              animation: crawl-limb-1-anim 0.8s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .crawl-limb-2 {
                              transform-origin: 8px 14px;
                              animation: crawl-limb-2-anim 0.8s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .crawl-limb-3 {
                              transform-origin: 16px 14px;
                              animation: crawl-limb-3-anim 0.8s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .crawl-limb-4 {
                              transform-origin: 16px 14px;
                              animation: crawl-limb-4-anim 0.8s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            @keyframes crawl-body-anim {
                              0%, 100% { transform: translateY(0px); }
                              50% { transform: translateY(-0.8px); }
                            }
                            @keyframes crawl-limb-1-anim {
                              0%, 100% { transform: rotate(-25deg); }
                              50% { transform: rotate(15deg); }
                            }
                            @keyframes crawl-limb-2-anim {
                              0%, 100% { transform: rotate(15deg); }
                              50% { transform: rotate(-25deg); }
                            }
                            @keyframes crawl-limb-3-anim {
                              0%, 100% { transform: rotate(-20deg); }
                              50% { transform: rotate(20deg); }
                            }
                            @keyframes crawl-limb-4-anim {
                              0%, 100% { transform: rotate(20deg); }
                              50% { transform: rotate(-20deg); }
                            }
                          `}
                        </style>
                        <g className="crawl-body">
                          <circle cx="17" cy="11.5" r="2.2" fill="#8f1d2c" />
                          <line x1="8" y1="14" x2="16" y2="14" stroke="#8f1d2c" strokeWidth="2.5" strokeLinecap="round" />
                        </g>
                        <g className="crawl-limb-1">
                          <line x1="8" y1="14" x2="6" y2="18.5" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                        <g className="crawl-limb-2">
                          <line x1="8" y1="14" x2="9.5" y2="18.5" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                        <g className="crawl-limb-3">
                          <line x1="16" y1="14" x2="14.5" y2="18.5" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                        <g className="crawl-limb-4">
                          <line x1="16" y1="14" x2="17.5" y2="18.5" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                      </svg>
                    )}
                    {motionMode === "walk" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" style={{ animationPlayState: isRunning ? "running" : "paused" } as React.CSSProperties}>
                        <style>
                          {`
                            .walk-body {
                              animation: walk-body-anim 1.0s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .walk-limb-1 {
                              transform-origin: 12px 13px;
                              animation: walk-limb-1-anim 1.0s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .walk-limb-2 {
                              transform-origin: 12px 13px;
                              animation: walk-limb-2-anim 1.0s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .walk-arm-1 {
                              transform-origin: 12px 8px;
                              animation: walk-arm-1-anim 1.0s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .walk-arm-2 {
                              transform-origin: 12px 8px;
                              animation: walk-arm-2-anim 1.0s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            @keyframes walk-body-anim {
                              0%, 100% { transform: translateY(0px); }
                              50% { transform: translateY(-0.8px); }
                            }
                            @keyframes walk-limb-1-anim {
                              0%, 100% { transform: rotate(-18deg); }
                              50% { transform: rotate(18deg); }
                            }
                            @keyframes walk-limb-2-anim {
                              0%, 100% { transform: rotate(18deg); }
                              50% { transform: rotate(-18deg); }
                            }
                            @keyframes walk-arm-1-anim {
                              0%, 100% { transform: rotate(15deg); }
                              50% { transform: rotate(-15deg); }
                            }
                            @keyframes walk-arm-2-anim {
                              0%, 100% { transform: rotate(-15deg); }
                              50% { transform: rotate(15deg); }
                            }
                          `}
                        </style>
                        <g className="walk-body">
                          <circle cx="12" cy="5" r="2.2" fill="#8f1d2c" />
                          <line x1="12" y1="7.2" x2="12" y2="13" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                        <g className="walk-arm-1">
                          <line x1="12" y1="8" x2="9.5" y2="12" stroke="#8f1d2c" strokeWidth="1.8" strokeLinecap="round" />
                        </g>
                        <g className="walk-arm-2">
                          <line x1="12" y1="8" x2="14.5" y2="12" stroke="#8f1d2c" strokeWidth={1.8} strokeLinecap="round" />
                        </g>
                        <g className="walk-limb-1">
                          <line x1="12" y1="13" x2="10" y2="19" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                        <g className="walk-limb-2">
                          <line x1="12" y1="13" x2="14" y2="19" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                      </svg>
                    )}
                    {motionMode === "run" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" style={{ animationPlayState: isRunning ? "running" : "paused" } as React.CSSProperties}>
                        <style>
                          {`
                            .run-body {
                              animation: run-body-anim 0.5s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .run-limb-1 {
                              transform-origin: 11px 13px;
                              animation: run-limb-1-anim 0.5s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .run-limb-2 {
                              transform-origin: 11px 13px;
                              animation: run-limb-2-anim 0.5s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .run-arm-1 {
                              transform-origin: 12.5px 7.5px;
                              animation: run-arm-1-anim 0.5s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            .run-arm-2 {
                              transform-origin: 12.5px 7.5px;
                              animation: run-arm-2-anim 0.5s infinite ease-in-out;
                              animation-play-state: inherit;
                            }
                            @keyframes run-body-anim {
                              0%, 100% { transform: translateY(0px); }
                              50% { transform: translateY(-1.5px); }
                            }
                            @keyframes run-limb-1-anim {
                              0%, 100% { transform: rotate(-35deg); }
                              50% { transform: rotate(35deg); }
                            }
                            @keyframes run-limb-2-anim {
                              0%, 100% { transform: rotate(35deg); }
                              50% { transform: rotate(-35deg); }
                            }
                            @keyframes run-arm-1-anim {
                              0%, 100% { transform: rotate(30deg); }
                              50% { transform: rotate(-40deg); }
                            }
                            @keyframes run-arm-2-anim {
                              0%, 100% { transform: rotate(-40deg); }
                              50% { transform: rotate(30deg); }
                            }
                          `}
                        </style>
                        <g className="run-body">
                          <circle cx="13" cy="4.5" r="2.2" fill="#8f1d2c" />
                          <line x1="13" y1="6.7" x2="11" y2="13" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" />
                        </g>
                        <g className="run-arm-1">
                          <path d="M 12.5 7.5 C 10 9, 9 11, 10 13" stroke="#8f1d2c" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                        </g>
                        <g className="run-arm-2">
                          <path d="M 12.5 7.5 C 15 9, 15 11, 13 13" stroke="#8f1d2c" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                        </g>
                        <g className="run-limb-1">
                          <path d="M 11 13 Q 8 16 10 20" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" fill="none" />
                        </g>
                        <g className="run-limb-2">
                          <path d="M 11 13 Q 14 16 12 20" stroke="#8f1d2c" strokeWidth="2" strokeLinecap="round" fill="none" />
                        </g>
                      </svg>
                    )}
                  </span>
                </h2>
                <button
                  onClick={() => {
                    setTempSound(isSoundEnabled);
                    setTempNotification(isNotificationEnabled);
                    setIsSettingsOpen(true);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#c8cacf] bg-white hover:bg-[#f7f7f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171719] transition-colors"
                  aria-label="설정"
                >
                  <Image src="/icons/settings.svg" alt="" width={18} height={18} />
                </button>
              </div>
              <p className="text-[16px] text-[#2e2f33e0]">
                {selectedMinutes} minute session · {selectedCategory?.name || "카테고리"}
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {presets.map((minutes) => (
                  <button
                    key={minutes}
                    disabled={remainingSeconds < selectedMinutes * 60}
                    onClick={() => choosePreset(minutes)}
                    className={`h-12 rounded-[14px] border text-[15px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171719] transition-opacity ${
                      selectedMinutes === minutes
                        ? "border-[#8f1d2c] bg-[#8f1d2c] text-white shadow-[0_6px_10px_0_#8f1d2c29]"
                        : "border-[#c8cacf] bg-white text-[#2e2f33e0]"
                    } ${remainingSeconds < selectedMinutes * 60 ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>

              <div className="mt-4">
                {/* Idle State */}
                {!isRunning && remainingSeconds === selectedMinutes * 60 && (
                  <button
                    onClick={startTimer}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#8f1d2c] text-[15px] font-semibold text-white shadow-[0_8px_14px_0_#8f1d2c29] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#731624]"
                  >
                    <Image src="/icons/play.svg" alt="" width={18} height={18} className="invert" />
                    Start
                  </button>
                )}

                {/* Running State */}
                {isRunning && (
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => setIsRunning(false)}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#c8cacf] bg-white text-[15px] font-semibold text-[#171719] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171719]"
                    >
                      <Image src="/icons/pause.svg" alt="" width={18} height={18} />
                      Pause
                    </button>
                    <button
                      onClick={() => saveSession("canceled", remainingSeconds)}
                      className="h-12 rounded-[14px] border border-[#ff4242] bg-[#fff5f5] px-4 text-[15px] font-medium text-[#ff4242] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4242]"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Paused State */}
                {!isRunning && remainingSeconds < selectedMinutes * 60 && (
                  <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:gap-2">
                    <button
                      onClick={startTimer}
                      className="flex h-12 col-span-2 sm:flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#8f1d2c] text-[15px] font-semibold text-white shadow-[0_8px_14px_0_#8f1d2c29] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#731624]"
                    >
                      <Image src="/icons/play.svg" alt="" width={18} height={18} className="invert" />
                      Resume
                    </button>
                    <button
                      onClick={() => saveSession("completed", remainingSeconds)}
                      className="h-12 col-span-1 sm:flex-initial rounded-[14px] border border-[#c8cacf] bg-white px-4 text-[15px] font-medium text-[#171719] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171719]"
                    >
                      Complete
                    </button>
                    <button
                      onClick={() => saveSession("canceled", remainingSeconds)}
                      className="h-12 col-span-1 sm:flex-initial rounded-[14px] border border-[#ff4242] bg-[#fff5f5] px-4 text-[15px] font-medium text-[#ff4242] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4242]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-[14px] border border-[#d9dade] bg-[#f7f7f8] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-medium text-[#37383c9c]">
                    Category
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsEditingCategories((prev) => !prev)}
                    className="text-[12px] font-semibold text-[#8f1d2c] hover:underline"
                  >
                    {isEditingCategories ? "Done" : "Edit"}
                  </button>
                </div>
                <p className="text-[15px] font-semibold">
                  {Math.round(completedToday / 60)}m today
                </p>
              </div>
              
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((category) => {
                  const isSelected = selectedCategoryId === category.id;
                  const isTimerStarted = remainingSeconds < selectedMinutes * 60;
                  
                  return (
                    <div key={category.id} className="flex items-center gap-1.5">
                      {isEditingCategories ? (
                        <div className="flex items-center gap-1 rounded-[14px] border border-[#d9dade] bg-white px-3 py-1 text-[14px] font-medium">
                          <input
                            type="text"
                            value={category.name}
                            onChange={(e) => renameCategoryLocal(category.id, e.target.value)}
                            onBlur={() => saveCategoryName(category.id, category.name)}
                            className="w-16 bg-transparent outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => deleteCategory(category.id)}
                            className="text-[#ff4242] hover:text-[#d32f2f] text-[15px] font-bold px-1"
                            title="삭제"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={isTimerStarted}
                          onClick={() => setSelectedCategoryId(category.id)}
                          style={
                            isSelected
                              ? {
                                  borderColor: category.color || "#8f1d2c",
                                  backgroundColor: `${category.color || "#8f1d2c"}15`,
                                  color: category.color || "#8f1d2c",
                                }
                              : undefined
                          }
                          className={`h-10 rounded-[14px] border px-4 text-[14px] font-medium transition-all ${
                            isSelected
                              ? ""
                              : "border-[#d9dade] bg-white text-[#37383c9c]"
                          } ${isTimerStarted ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {category.name}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add category input & color tray */}
              <div className="mt-4 border-t border-[#d9dade/40] pt-3">
                <div className="flex gap-2">
                  <input
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="새 카테고리"
                    className="h-11 min-w-0 flex-1 rounded-[14px] border border-[#c8cacf] bg-white px-4 text-[15px] outline-none focus:border-[#8f1d2c]"
                  />
                  <button
                    onClick={addCategory}
                    className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#c8cacf] bg-white hover:bg-[#f7f7f8]"
                    aria-label="카테고리 추가"
                  >
                    <Image src="/icons/add-plus.svg" alt="" width={18} height={18} />
                  </button>
                </div>
                
                <div className="mt-2 flex items-center gap-2 pl-1">
                  <span className="text-[12px] font-medium text-[#37383c9c]">색상 선택:</span>
                  {["#8f1d2c", "#0066ff", "#00bf40", "#cb59ff", "#ff9200"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCategoryColor(color)}
                      className="w-5 h-5 rounded-full border border-black/10 transition-transform"
                      style={{
                        backgroundColor: color,
                        transform: newCategoryColor === color ? "scale(1.2)" : "scale(1)",
                        boxShadow: newCategoryColor === color ? "0 0 0 2px #171719" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Second Row: Bar Chart Grid */}
        <div className="grid border-t border-[#d9dade] px-6 py-6 lg:grid-cols-[1fr_1.4fr] lg:px-8 lg:py-8">
          <div className="flex items-center gap-3">
            <button className="flex h-12 items-center gap-12 rounded-[5px] border border-[#c8cacf] bg-white px-3 text-[18px] text-[#171719]">
              {barTitle}
              <Image src="/icons/chevron-down.svg" alt="" width={16} height={16} />
            </button>
          </div>

          <div className="mt-6 overflow-x-auto pb-2 lg:mt-0 flex-grow scrollbar-thin">
            <div className="flex h-36 items-end gap-2 min-w-[420px] w-full">
              {summaryBars.map((bar) => {
                const height = Math.max(
                  20,
                  Math.min(128, bar.minutes * (statsMode === "day" ? 1.8 : 0.42)),
                );
                const active = bar.minutes >= (statsMode === "day" ? 50 : 180);
                const isSelected = selectedDate === bar.periodKey;

                return (
                  <div
                    key={bar.label}
                    onClick={() => {
                      setSelectedDate((prev) => (prev === bar.periodKey ? null : bar.periodKey));
                    }}
                    className="flex flex-1 flex-col items-center cursor-pointer group"
                  >
                    <div
                      className={`flex w-full items-end justify-center rounded-t-[3px] pb-2 text-[13px] transition-all hover:opacity-85 ${
                        isSelected
                          ? "bg-[#8f1d2c] text-white ring-2 ring-offset-1 ring-[#8f1d2c]"
                          : active
                            ? "bg-[#8f1d2c] text-white"
                            : "bg-[#d7d8da]"
                      }`}
                      style={{ height }}
                    >
                      {bar.minutes > 0 ? bar.minutes : ""}
                    </div>
                    <span className={`mt-2 text-[13px] transition-colors ${isSelected ? "text-[#8f1d2c] font-bold" : "text-[#37383c9c]"}`}>
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Third Row: Session History */}
        <div className="border-t border-[#d9dade] px-6 py-6 lg:px-8 lg:py-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[18px] font-semibold text-[#171719]">집중 기록 (Focus History)</h3>
              {(filterCategoryId || selectedDate) && (
                <button
                  onClick={() => {
                    setFilterCategoryId("");
                    setSelectedDate(null);
                  }}
                  className="flex items-center gap-1 rounded-[14px] border border-[#ecd0d5] bg-[#f7e8eb] px-2.5 py-0.5 text-[12px] font-medium text-[#8f1d2c] hover:bg-[#ecd0d5] transition-colors"
                >
                  필터 해제 ×
                </button>
              )}
            </div>
            <span className="text-[13px] text-[#37383c9c]">
              총 {sessions.length}개 중 {
                sessions.filter((s) => {
                  if (filterCategoryId && s.categoryId !== filterCategoryId) return false;
                  if (!isSessionInSelectedDate(s, selectedDate)) return false;
                  return true;
                }).length
              }개 표시
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#eaebec] text-[13px] font-semibold text-[#37383c9c] whitespace-nowrap">
                  <th className="pb-3 pt-2">날짜/시간</th>
                  <th className="pb-3 pt-2">카테고리</th>
                  <th className="pb-3 pt-2">목표 시간</th>
                  <th className="pb-3 pt-2">실제 집중 시간</th>
                  <th className="pb-3 pt-2">상태</th>
                  <th className="pb-3 pt-2 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaebec] text-[14px]">
                {sessions
                  .filter((session) => {
                    if (filterCategoryId && session.categoryId !== filterCategoryId) return false;
                    if (selectedDate && dateKey(session.endedAt) !== selectedDate) return false;
                    return true;
                  })
                  .slice(0, 15)
                  .map((session) => {
                    const cat = categories.find((c) => c.id === session.categoryId);
                    return (
                      <tr key={session.id} className="hover:bg-[#f7f7f8] transition-colors whitespace-nowrap">
                        <td className="py-3 text-[#2e2f33e0]">
                          {new Date(session.endedAt).toLocaleString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
                              style={{ backgroundColor: cat?.color || "#8f1d2c" }}
                            />
                            <span className="font-medium text-[#171719]">{cat?.name || "미지정"}</span>
                          </div>
                        </td>
                        <td className="py-3 text-[#37383c9c]">{session.plannedMinutes}분</td>
                        <td className="py-3 font-medium text-[#2e2f33e0]">
                          {Math.floor(session.actualSeconds / 60)}분 {session.actualSeconds % 60}초
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-[10px] text-[12px] font-semibold ${
                              session.status === "completed"
                                ? "bg-[#e8f7ec] text-[#00bf40]"
                                : "bg-[#fff5f5] text-[#ff4242]"
                            }`}
                          >
                            {session.status === "completed" ? "완료" : "취소"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => deleteSession(session.id)}
                            className="text-[#ff4242] hover:text-[#d32f2f] text-[13px] font-medium transition-colors hover:underline"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {sessions.filter((session) => {
                  if (filterCategoryId && session.categoryId !== filterCategoryId) return false;
                  if (!isSessionInSelectedDate(session, selectedDate)) return false;
                  return true;
                }).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#37383c9c]">
                      해당하는 집중 세션 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] w-full max-w-sm border border-[#d9dade] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#eaebec] pb-3.5 mb-5">
              <h3 className="text-[18px] font-bold text-[#171719]">타이머 설정</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-[#37383c9c] hover:text-[#171719] text-[22px] font-semibold leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Sound Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-[#171719]">종료 알림음</p>
                  <p className="text-[12px] text-[#37383c9c]">세션 완료 시 맑은 차임벨 소리를 재생합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={tempSound}
                  onChange={(e) => setTempSound(e.target.checked)}
                  className="accent-[#8f1d2c] w-[18px] h-[18px] cursor-pointer"
                />
              </div>

              {/* Push Notification Toggle */}
              <div className="flex items-center justify-between pt-3.5 border-t border-[#eaebec]/60">
                <div>
                  <p className="text-[14px] font-semibold text-[#171719]">시스템 푸시 알림</p>
                  <p className="text-[12px] text-[#37383c9c]">세션 완료 시 OS 시스템 알림창을 띄웁니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={tempNotification}
                  onChange={(e) => setTempNotification(e.target.checked)}
                  className="accent-[#8f1d2c] w-[18px] h-[18px] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-7 border-t border-[#eaebec] pt-4">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="h-10 px-4 rounded-[12px] border border-[#c8cacf] text-[13px] font-medium text-[#171719] hover:bg-[#f7f7f8] transition-colors"
              >
                취소
              </button>
              <button
                onClick={saveSettings}
                className="h-10 px-5 rounded-[12px] bg-[#8f1d2c] text-[13px] font-semibold text-white hover:bg-[#731624] transition-colors shadow-[0_2px_4px_0_#8f1d2c20]"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
