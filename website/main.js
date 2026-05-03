/* ═══════════════════════════════════════════════════════════
   2KBridge — Website JS
   Handles: i18n, dark/light theme, scroll effects, animations
   ═══════════════════════════════════════════════════════════ */

// ── Translations ─────────────────────────────────────────
const TRANSLATIONS = {
  fr: {
    'nav.features':  'Fonctionnalités',
    'nav.how':       'Comment ça marche',
    'nav.tech':      'Stack',
    'nav.download':  'Télécharger',
    'nav.cta':       'Télécharger',

    'hero.eyebrow':      'Open Source · WebRTC · Windows 11',
    'hero.title.line1':  'Joue à NBA 2K14',
    'hero.title.line2':  'avec tes potes,',
    'hero.title.line3':  'n\'importe où.',
    'hero.sub':          'Stream P2P via WebRTC, lobby en temps réel, inputs clavier et manette — tout ça gratuitement, sans abonnement, sans serveur cloud.',
    'hero.cta.primary':  'Télécharger gratuitement',
    'hero.cta.secondary':'Voir comment ça marche',
    'hero.note':         'Windows 11 · Aucune inscription serveur requise',

    'features.label': 'Fonctionnalités',
    'features.title': 'Tout ce qu\'il faut pour jouer ensemble.',
    'features.sub':   'Conçu pour être simple à lancer, difficile à lâcher.',

    'feat.stream.title': 'Stream P2P',
    'feat.stream.desc':  'WebRTC direct entre les joueurs. Aucun serveur relai, latence minimale, qualité préservée.',
    'feat.lobby.title':  'Rooms & Lobby',
    'feat.lobby.desc':   'Crée ou rejoins une room avec un code à 8 chiffres. Jusqu\'à 4 joueurs simultanément.',
    'feat.inputs.title': 'Inputs en temps réel',
    'feat.inputs.desc':  'Clavier, souris et manette Xbox via ViGEm. Les commandes du client arrivent sur le host en millisecondes.',
    'feat.chat.title':   'Chat intégré',
    'feat.chat.desc':    'Discute avec tes amis directement dans l\'app. Messages en temps réel via Socket.io.',
    'feat.perms.title':  'Contrôle des permissions',
    'feat.perms.desc':   'Le host active ou désactive clavier, souris et manette pour chaque joueur individuellement.',
    'feat.invite.title': 'Invitations directes',
    'feat.invite.desc':  'Invite un ami par son pseudo sans quitter l\'app. Il reçoit l\'invitation en temps réel dans son lobby.',

    'how.label': 'Comment ça marche',
    'how.title': 'En 4 étapes, tu joues.',

    'step1.title': 'Télécharge 2KBridge',
    'step1.desc':  'Lance l\'installeur Windows. Aucun compte serveur requis.',
    'step2.title': 'Crée une room',
    'step2.desc':  'Partage le code à 8 chiffres avec tes amis.',
    'step3.title': 'Lance NBA 2K14',
    'step3.desc':  'Le stream démarre automatiquement dès le lancement.',
    'step4.title': 'Joue avec tes amis',
    'step4.desc':  'Tes amis voient l\'écran et envoient leurs inputs. C\'est parti.',

    'tech.label':    'Stack technique',
    'tech.title':    'Construit avec les bons outils.',
    'tech.sub':      'Technologies open source, testées en production.',
    'tech.webrtc':   '— Stream P2P',
    'tech.electron': '— App Windows native',
    'tech.node':     '— Serveur lobby & signaling',
    'tech.socket':   '— Temps réel · Chat · Rooms',

    'dl.title': 'Prêt à jouer ?',
    'dl.sub':   'Télécharge 2KBridge gratuitement et rejoins tes amis en quelques secondes.',
    'dl.btn':   'Télécharger 2KBridge',
    'dl.perk1': 'Gratuit, pour toujours',
    'dl.perk2': 'Open source, sans pub',
    'dl.perk3': 'Aucun abonnement',
    'dl.note':  'Windows 11 · Electron · Aucun compte requis côté serveur',

    'footer.tagline': 'Remote play gratuit pour NBA 2K14. Joue avec tes amis, peu importe où vous êtes.',
    'footer.nav':     'Navigation',
    'footer.project': 'Projet',
    'footer.copy':    '© 2024 2KBridge. Tous droits réservés.',
  },

  en: {
    'nav.features':  'Features',
    'nav.how':       'How it works',
    'nav.tech':      'Stack',
    'nav.download':  'Download',
    'nav.cta':       'Download',

    'hero.eyebrow':      'Open Source · WebRTC · Windows 11',
    'hero.title.line1':  'Play NBA 2K14',
    'hero.title.line2':  'with your friends,',
    'hero.title.line3':  'anywhere.',
    'hero.sub':          'P2P streaming via WebRTC, real-time lobby, keyboard and controller inputs — all free, no subscription, no cloud server.',
    'hero.cta.primary':  'Download for free',
    'hero.cta.secondary':'See how it works',
    'hero.note':         'Windows 11 · No server account required',

    'features.label': 'Features',
    'features.title': 'Everything you need to play together.',
    'features.sub':   'Built to be simple to start, hard to put down.',

    'feat.stream.title': 'P2P Stream',
    'feat.stream.desc':  'Direct WebRTC between players. No relay server, minimal latency, full quality.',
    'feat.lobby.title':  'Rooms & Lobby',
    'feat.lobby.desc':   'Create or join a room with an 8-digit code. Up to 4 simultaneous players.',
    'feat.inputs.title': 'Real-time inputs',
    'feat.inputs.desc':  'Keyboard, mouse and Xbox controller via ViGEm. Client inputs reach the host in milliseconds.',
    'feat.chat.title':   'Built-in chat',
    'feat.chat.desc':    'Chat with your friends directly in the app. Real-time messages via Socket.io.',
    'feat.perms.title':  'Permission control',
    'feat.perms.desc':   'The host can enable or disable keyboard, mouse and controller for each player individually.',
    'feat.invite.title': 'Direct invitations',
    'feat.invite.desc':  'Invite a friend by username without leaving the app. They receive the invite in real-time.',

    'how.label': 'How it works',
    'how.title': 'In 4 steps, you\'re playing.',

    'step1.title': 'Download 2KBridge',
    'step1.desc':  'Run the Windows installer. No server account required.',
    'step2.title': 'Create a room',
    'step2.desc':  'Share the 8-digit code with your friends.',
    'step3.title': 'Launch NBA 2K14',
    'step3.desc':  'The stream starts automatically on launch.',
    'step4.title': 'Play with friends',
    'step4.desc':  'Your friends see the screen and send their inputs. Let\'s go.',

    'tech.label':    'Tech stack',
    'tech.title':    'Built with the right tools.',
    'tech.sub':      'Open source technologies, production-tested.',
    'tech.webrtc':   '— P2P Stream',
    'tech.electron': '— Native Windows app',
    'tech.node':     '— Lobby & signaling server',
    'tech.socket':   '— Real-time · Chat · Rooms',

    'dl.title': 'Ready to play?',
    'dl.sub':   'Download 2KBridge for free and join your friends in seconds.',
    'dl.btn':   'Download 2KBridge',
    'dl.perk1': 'Free, forever',
    'dl.perk2': 'Open source, no ads',
    'dl.perk3': 'No subscription',
    'dl.note':  'Windows 11 · Electron · No server account required',

    'footer.tagline': 'Free remote play for NBA 2K14. Play with your friends, wherever you are.',
    'footer.nav':     'Navigation',
    'footer.project': 'Project',
    'footer.copy':    '© 2024 2KBridge. All rights reserved.',
  }
};

// ── State ─────────────────────────────────────────────────
let currentLang  = 'fr';
let currentTheme = 'dark';

// ── i18n ─────────────────────────────────────────────────
function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  localStorage.setItem('2kb_lang', lang);

  // Update all text nodes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = TRANSLATIONS[lang][key];
    if (text !== undefined) el.textContent = text;
  });

  // Update lang toggle buttons
  document.getElementById('btn-fr').classList.toggle('active', lang === 'fr');
  document.getElementById('btn-en').classList.toggle('active', lang === 'en');
  document.getElementById('btn-fr').setAttribute('aria-pressed', lang === 'fr');
  document.getElementById('btn-en').setAttribute('aria-pressed', lang === 'en');

  // Update <html lang>
  document.documentElement.lang = lang;
}

// ── Theme ─────────────────────────────────────────────────
function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('2kb_theme', theme);

  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark'
      ? (currentLang === 'fr' ? 'Passer en mode clair' : 'Switch to light mode')
      : (currentLang === 'fr' ? 'Passer en mode sombre' : 'Switch to dark mode')
    );
  }
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ── Scroll: navbar glass + active links ──────────────────
function initScrollSpy() {
  const navbar = document.getElementById('navbar');
  const navLinks = document.querySelectorAll('.nav-link');

  const sections = Array.from(document.querySelectorAll('section[id]'));

  const onScroll = () => {
    // Navbar glass on scroll
    if (window.scrollY > 30) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Active nav link (section in view)
    const scrollY = window.scrollY + 80;
    let current = '';
    sections.forEach(sec => {
      if (sec.offsetTop <= scrollY) current = sec.id;
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href').replace('#', '');
      link.classList.toggle('active', href === current);
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load
}

// ── Scroll-triggered animations ──────────────────────────
function initAnimations() {
  const els = document.querySelectorAll('[data-animate]');
  if (!els.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px',
  });

  // Stagger feature cards
  document.querySelectorAll('.feature-card[data-animate]').forEach((card, i) => {
    card.style.transitionDelay = `${i * 0.08}s`;
  });

  els.forEach(el => observer.observe(el));
}

// ── Smooth scroll with navbar offset ─────────────────────
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();

      const navHeight = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--nav-height'),
        10
      ) || 68;

      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

// ── Intro animation ──────────────────────────────────────
function initIntro() {
  const overlay = document.getElementById('intro');
  if (!overlay) return;

  document.body.style.overflow = 'hidden';

  // Step 1: logo fades in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('show'));
  });

  // Step 2: overlay slides up after 1.1s
  setTimeout(() => {
    overlay.classList.add('exit');
    document.body.style.overflow = '';

    // Trigger spring-in for hero content
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-ready');

    // Step 3: remove overlay from DOM after transition
    setTimeout(() => overlay.remove(), 1100);
  }, 1100);
}

// ── Particle system ──────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('hero-particles');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let pts = [];
  let raf;

  function resize() {
    canvas.width  = canvas.offsetWidth  * (window.devicePixelRatio || 1);
    canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }

  function spawn() {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const n = Math.min(55, Math.floor((w * h) / 11000));
    pts = Array.from({ length: n }, () => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r:  Math.random() * 1.3 + 0.4,
      a:  Math.random() * 0.28 + 0.07,
    }));
  }

  function tick() {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const rgb = isLight ? '234,88,12' : '249,115,22';

    pts.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0)  p.x = w;
      if (p.x > w)  p.x = 0;
      if (p.y < 0)  p.y = h;
      if (p.y > h)  p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb},${p.a})`;
      ctx.fill();
    });

    // Subtle connections between close particles
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(${rgb},${0.055 * (1 - d / 110)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(tick);
  }

  resize();
  spawn();
  tick();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); spawn(); }, 200);
  });
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('2kb_theme') || 'dark';
  const savedLang  = localStorage.getItem('2kb_lang')  || 'fr';

  setTheme(savedTheme);
  setLang(savedLang);

  initIntro();
  initParticles();
  initScrollSpy();
  initAnimations();
  initSmoothScroll();
});
