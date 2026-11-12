// ================= Nahean Music =================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- Storage helpers ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
let favorites = store.get("nm_fav", []);
let history = store.get("nm_hist", []);

// ---------- State ----------
let queue = [];          // current list of songs
let queueIndex = -1;
let currentSong = null;
let player = null;
let playerReady = false;
let ticker = null;
let rotation = 0, rotTimer = null;
let pendingVideo = null;

// ---------- Elements ----------
const statusEl = $("#status");
const resultsList = $("#resultsList");
const resultsTitle = $("#resultsTitle");
const queueList = $("#queueList");
const progress = $("#progress");
const controlIcon = $("#controlIcon");
const rotatingImage = $("#rotatingImage");
const songTitle = $("#songTitle");
const songArtist = $("#songArtist");
const favBtn = $("#favBtn");

// ---------- Views (sidebar) ----------
function showView(name) {
  $("#view-discover").classList.toggle("hidden", name !== "discover");
  $("#view-results").classList.toggle("hidden", name === "discover");
}

$$(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    $$(".nav-item.active").forEach((a) => a.classList.remove("active"));
    item.classList.add("active");
    const view = item.dataset.view;
    statusEl.textContent = "";

    if (view === "discover") { showView("discover"); }
    else if (view === "search") { showView("results"); resultsTitle.textContent = "Search";
      resultsList.innerHTML = '<p class="empty">Type a song name in the box above and search.</p>'; $("#searchInput").focus(); }
    else if (view === "trending") { runSearch("trending songs this week", "Trending"); }
    else if (view === "playlist") { runSearch("top hits playlist", "Playlist"); }
    else if (view === "favorites") { renderList(favorites, "Favorites ❤️", "No favorites yet. Tap the heart next to a song."); }
    else if (view === "history") { renderList(history, "History", "You have not played any song yet."); }
    else if (view === "about") { showView("results"); resultsTitle.textContent = "About";
      resultsList.innerHTML = '<p class="about-box">GaanBox - a personal music app by Nihal. Search and play any song from YouTube.</p>'; }
  });
});

// ---------- Drag scroll (artists) ----------
$$(".containers").forEach((c) => {
  let down = false, startX, sl, moved = false;
  c.addEventListener("mousedown", (e) => { down = true; moved = false; startX = e.pageX - c.offsetLeft; sl = c.scrollLeft; });
  c.addEventListener("mousemove", (e) => { if (!down) return; e.preventDefault(); moved = true;
    c.scrollLeft = sl - (e.pageX - c.offsetLeft - startX) * 0.6; });
  c.addEventListener("mouseup", () => (down = false));
  c.addEventListener("mouseleave", () => (down = false));
  c.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
});

// ---------- Swiper ----------
const swiper = new Swiper(".swiper", {
  effect: "coverflow", grabCursor: true, centeredSlides: true, loop: true, speed: 600,
  slidesPerView: "auto",
  coverflowEffect: { rotate: 10, stretch: 120, depth: 200, modifier: 1, slideShadows: false },
  pagination: { el: ".swiper-pagination" },
});

// ---------- Click on playlist slides / artists => search ----------
$$(".swiper-slide").forEach((s) => s.addEventListener("click", () => {
  if (s.classList.contains("swiper-slide-active")) runSearch(s.dataset.q, s.querySelector("h2").textContent);
}));
$$(".artist").forEach((a) => a.addEventListener("click", () => runSearch(a.dataset.q, a.querySelector("p").textContent)));

// ---------- Search ----------
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#searchInput").value.trim();
  if (q) runSearch(q, `"${q}"`);
});

function decode(s) { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; }

async function runSearch(query, title) {
  if (typeof YT_API_KEY === "undefined" || YT_API_KEY === "YOUR_API_KEY_HERE") {
    showView("results"); resultsTitle.textContent = "Setup needed";
    resultsList.innerHTML = '<p class="empty">Put your API key in the config.js file.</p>'; return;
  }
  showView("results");
  resultsTitle.textContent = title || "Results";
  resultsList.innerHTML = "";
  statusEl.textContent = "Searching...";
  try {
    const url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=20&q="
      + encodeURIComponent(query) + "&key=" + YT_API_KEY;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const songs = (data.items || []).map((it) => ({
      id: it.id.videoId,
      title: decode(it.snippet.title),
      artist: decode(it.snippet.channelTitle),
      thumb: (it.snippet.thumbnails.medium || it.snippet.thumbnails.default).url,
    }));
    statusEl.textContent = songs.length ? "" : "No results found.";
    renderList(songs, title || "Results", "No results found.");
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  }
}

function isFav(id) { return favorites.some((s) => s.id === id); }

function renderList(songs, title, emptyMsg) {
  showView("results");
  resultsTitle.textContent = title;
  resultsList.innerHTML = "";
  if (!songs.length) { resultsList.innerHTML = `<p class="empty">${emptyMsg}</p>`; return; }
  songs.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "result-item";
    row.innerHTML = `<img src="${s.thumb}" alt="" /><div><h3></h3><p></p></div>
      <button class="heart ${isFav(s.id) ? "on" : ""}"><i class="${isFav(s.id) ? "fa-solid" : "fa-regular"} fa-heart"></i></button>`;
    row.querySelector("h3").textContent = s.title;
    row.querySelector("p").textContent = s.artist;
    row.addEventListener("click", () => playFromList(songs, i));
    row.querySelector(".heart").addEventListener("click", (e) => {
      e.stopPropagation(); toggleFav(s);
      const on = isFav(s.id);
      e.currentTarget.classList.toggle("on", on);
      e.currentTarget.innerHTML = `<i class="${on ? "fa-solid" : "fa-regular"} fa-heart"></i>`;
    });
    resultsList.appendChild(row);
  });
}

function toggleFav(s) {
  if (isFav(s.id)) favorites = favorites.filter((x) => x.id !== s.id);
  else favorites.unshift(s);
  store.set("nm_fav", favorites);
  updateFavBtn();
}
function updateFavBtn() {
  const on = currentSong && isFav(currentSong.id);
  favBtn.classList.toggle("on", !!on);
  favBtn.innerHTML = `<i class="${on ? "fa-solid" : "fa-regular"} fa-heart"></i> ${on ? "Favorited" : "Favorite"}`;
}
favBtn.addEventListener("click", () => { if (currentSong) toggleFav(currentSong); });

// ---------- Queue ----------
function renderQueue() {
  queueList.innerHTML = "";
  queue.slice(0, 15).forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "song" + (i === queueIndex ? " playing" : "");
    el.innerHTML = `<div class="song-img"><img src="${s.thumb}" alt="" /><div class="overlay"><i class="fa-solid fa-play"></i></div></div>
      <div class="song-title"><h2></h2><p></p></div><span></span>`;
    el.querySelector("h2").textContent = s.title;
    el.querySelector("p").textContent = s.artist;
    el.addEventListener("click", () => playIndex(i));
    queueList.appendChild(el);
  });
}

function playFromList(songs, i) { queue = songs.slice(); renderQueue(); playIndex(i); }

// ---------- YouTube Player ----------
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("ytPlayer", {
    height: "120", width: "213",
    playerVars: { playsinline: 1, controls: 0, rel: 0, origin: location.origin },
    events: {
      onReady: () => { playerReady = true; if (pendingVideo) { player.loadVideoById(pendingVideo); pendingVideo = null; } },
      onStateChange: onPlayerState,
      onError: () => { statusEl.textContent = "This song cannot be played here, skipping to the next..."; setTimeout(next, 1200); },
    },
  });
};

function playIndex(i) {
  if (!queue[i]) return;
  queueIndex = i;
  currentSong = queue[i];
  songTitle.textContent = currentSong.title;
  songArtist.textContent = currentSong.artist;
  rotatingImage.src = currentSong.thumb;
  history = [currentSong, ...history.filter((s) => s.id !== currentSong.id)].slice(0, 50);
  store.set("nm_hist", history);
  updateFavBtn(); renderQueue();
  if (playerReady) player.loadVideoById(currentSong.id); else pendingVideo = currentSong.id;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: currentSong.title, artist: currentSong.artist, artwork: [{ src: currentSong.thumb }] });
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
  }
}

function onPlayerState(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    controlIcon.classList.replace("fa-play", "fa-pause"); startRot(); startTicker();
    progress.max = player.getDuration() || 100;
    $("#durTime").textContent = fmt(player.getDuration());
  } else if (e.data === S.PAUSED) {
    controlIcon.classList.replace("fa-pause", "fa-play"); stopRot();
  } else if (e.data === S.ENDED) { next(); }
}

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (!playerReady || !player.getCurrentTime) return;
    const t = player.getCurrentTime();
    progress.value = t; $("#curTime").textContent = fmt(t);
  }, 500);
}
function fmt(s) { s = Math.floor(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

function startRot() { if (!rotTimer) rotTimer = setInterval(() => { rotation += 1; rotatingImage.style.transform = `rotate(${rotation}deg)`; }, 50); }
function stopRot() { clearInterval(rotTimer); rotTimer = null; }

function togglePlay() {
  if (!playerReady) { statusEl.textContent = "Player is loading, try again in a moment."; return; }
  if (!currentSong) { statusEl.textContent = "Pick a song first."; return; }
  const st = player.getPlayerState();
  if (st === YT.PlayerState.PLAYING) player.pauseVideo(); else player.playVideo();
}
function next() { if (queue.length) playIndex((queueIndex + 1) % queue.length); }
function prev() { if (queue.length) playIndex((queueIndex - 1 + queue.length) % queue.length); }

$(".play-pause-btn").addEventListener("click", togglePlay);
$(".forward").addEventListener("click", next);
$(".backward").addEventListener("click", prev);
progress.addEventListener("input", () => { if (playerReady) player.seekTo(Number(progress.value), true); });
