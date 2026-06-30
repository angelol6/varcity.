import './style.css';
import { supabase } from './supabase.js';

// --- Data Migration (From old exams+plan to unified curriculum) ---
function migrateData() {
  let oldExams = localStorage.getItem('varcity_exams');
  let oldPlan = localStorage.getItem('varcity_plan');
  let curriculum = localStorage.getItem('varcity_curriculum');

  if (!curriculum && (oldExams || oldPlan)) {
    let newCurriculum = [];
    if (oldExams) {
      JSON.parse(oldExams).forEach(ex => {
        newCurriculum.push({
          id: ex.id || Date.now().toString() + Math.random(),
          status: 'passed',
          type: ex.type || 'standard',
          subject: ex.subject,
          grade: ex.grade,
          isLode: ex.isLode,
          credits: ex.credits,
          date: ex.date,
          year: 1 // Default to year 1 since old exams didn't have year
        });
      });
    }
    if (oldPlan) {
      JSON.parse(oldPlan).forEach(pl => {
        newCurriculum.push({
          id: pl.id || Date.now().toString() + Math.random(),
          status: 'planned',
          type: 'standard', // Default for planned
          subject: pl.subject,
          credits: pl.credits,
          year: pl.year,
          appelli: '' // No appelli in old plan
        });
      });
    }
    localStorage.setItem('varcity_curriculum', JSON.stringify(newCurriculum));
    localStorage.removeItem('varcity_exams');
    localStorage.removeItem('varcity_plan');
  }
}
migrateData();

// --- State Management ---
let currentUser = null;
let curriculum = JSON.parse(localStorage.getItem('varcity_curriculum')) || [];
let lessons = JSON.parse(localStorage.getItem('varcity_schedule')) || [];
let taxes = JSON.parse(localStorage.getItem('varcity_taxes')) || [];
let currentTheme = localStorage.getItem('varcity_theme') || 'dark';
let lodeWeight = parseInt(localStorage.getItem('varcity_lode_weight')) || 31;
let userName = localStorage.getItem('varcity_username') || '';
let userUniversity = localStorage.getItem('varcity_university') || '';
let userDegreeName = localStorage.getItem('varcity_degree_name') || '';

let trendChartInstance = null;

async function saveAll(key, data) {
  // Always save locally first for offline support and immediate UI updates
  localStorage.setItem(key, JSON.stringify(data));
  updateUI();

  // If logged in, sync to Supabase
  if (currentUser && supabase) {
    if (key === 'varcity_curriculum') {
      try {
        // Delete existing items for user and insert new ones
        await supabase.from('curriculum').delete().eq('user_id', currentUser.id);
        
        if (data.length > 0) {
          const insertData = data.map(item => ({
            id: item.id,
            user_id: currentUser.id,
            status: item.status,
            type: item.type || 'standard',
            subject: item.subject,
            credits: item.credits,
            year: item.year,
            semester: item.semester,
            grade: item.grade,
            is_lode: item.isLode,
            date: item.date,
            appelli: item.appelli || '',
            unconfirmed: item.unconfirmed || false
          }));
          const { error } = await supabase.from('curriculum').insert(insertData);
          if (error) {
            console.error('Errore nel salvataggio su Supabase:', error);
            alert("Errore salvataggio Cloud: " + error.message + "\nAssicurati che la tabella 'curriculum' esista e abbia tutte le colonne necessarie.");
          }
        }
      } catch (e) {
        console.error('Eccezione Supabase:', e);
        alert("Eccezione Cloud: " + e.message);
      }
    }
  }
}

async function fetchCloudData() {
  if (!currentUser || !supabase) return;
  
  const { data, error } = await supabase.from('curriculum').select('*').eq('user_id', currentUser.id);
  if (error) {
    console.error('Errore nel recupero dati:', error);
    alert("Errore caricamento Cloud: " + error.message + "\nLa tabella 'curriculum' esiste?");
    return;
  }
  
  if (data && data.length > 0) {
    // Override local with cloud data
    curriculum = data.map(item => ({
      id: item.id,
      status: item.status,
      type: item.type,
      subject: item.subject,
      credits: item.credits,
      year: item.year,
      semester: item.semester,
      grade: item.grade,
      isLode: item.is_lode,
      date: item.date,
      appelli: item.appelli,
      unconfirmed: item.unconfirmed
    }));
    localStorage.setItem('varcity_curriculum', JSON.stringify(curriculum));
    updateUI();
  } else if (curriculum.length > 0) {
    // First login: cloud is empty but local has data -> sync local UP to cloud
    console.log('Migrating local data to cloud...');
    saveAll('varcity_curriculum', curriculum);
  }
}

async function checkAuth() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  
  if (currentUser) {
    await fetchCloudData();
  }
  
  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    if (event === 'SIGNED_IN') {
      await fetchCloudData();
      document.getElementById('authModal').classList.remove('open');
    }
    updateAuthUI();
  });
  
  updateAuthUI();
}

function updateAuthUI() {
  const btn = document.getElementById('openAuthModalBtn');
  const statusContainer = document.getElementById('authStatusContainer');
  const emailDisplay = document.getElementById('authEmailDisplay');
  
  if (btn && statusContainer && emailDisplay) {
    if (currentUser) {
      btn.style.display = 'none';
      statusContainer.style.display = 'block';
      emailDisplay.textContent = currentUser.email;
    } else {
      btn.style.display = 'block';
      statusContainer.style.display = 'none';
      emailDisplay.textContent = '';
    }
  }
}


// --- DOM Elements ---
const htmlEl = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const metaThemeColor = document.getElementById('meta-theme-color');

const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');

// Lists
const planList = document.getElementById('plan-list');
const scheduleList = document.getElementById('schedule-list');
const taxesList = document.getElementById('taxes-list');

// Stats Elements
const statWeighted = document.getElementById('stat-weighted-gpa');
const statArithmetic = document.getElementById('stat-arithmetic-gpa');
const statCredits = document.getElementById('stat-credits');
const statExamsCount = document.getElementById('stat-exams-count');

// Widgets
const widgetNextLesson = document.getElementById('widget-next-lesson');
const widgetNextTax = document.getElementById('widget-next-tax');

// Modals
const modalAddCurriculum = document.getElementById('modal-add-curriculum');
const modalAddLesson = document.getElementById('modal-add-lesson');
const modalAddTax = document.getElementById('modal-add-tax');


// Forms
const formAddCurriculum = document.getElementById('form-add-curriculum');
const formAddLesson = document.getElementById('form-add-lesson');
const formAddTax = document.getElementById('form-add-tax');

// Quick Sim
const btnQuickSim = document.getElementById('btn-quick-sim');
const quickSimResult = document.getElementById('quick-sim-result');

// Specific form elements
const inputStatus = document.getElementById('input-status');
const inputType = document.getElementById('input-type');
const gradeRow = document.getElementById('grade-row');
const inputGrade = document.getElementById('input-grade');
const inputLode = document.getElementById('input-lode');
const dateGroup = document.getElementById('date-group');
const inputDate = document.getElementById('input-date');
const appelliGroup = document.getElementById('appelli-group');
const inputAppelli = document.getElementById('input-appelli');
const inputEditingId = document.getElementById('input-editing-id');
const inputSubject = document.getElementById('input-subject');
const inputCredits = document.getElementById('input-credits');
const inputYear = document.getElementById('input-year');
const inputSemester = document.getElementById('input-semester');
const inputUnconfirmed = document.getElementById('input-unconfirmed');
let isReorderMode = false;

// --- Initialization ---
function init() {
  applyTheme(currentTheme);
  setupThemeToggle();
  setupNavigation();
  setupModals();
  setupSettings();
  setupSimulator();
  setupCurriculumFormToggles();
  setupChartToggle();
  checkAuth();
  setupAuthListeners();
  updateUI();
}

function setupAuthListeners() {
  const btnOpen = document.getElementById('openAuthModalBtn');
  const modal = document.getElementById('authModal');
  const btnLogin = document.getElementById('loginBtn');
  const btnSignup = document.getElementById('signupBtn');
  const btnLogout = document.getElementById('logoutBtn');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const errorMsg = document.getElementById('authErrorMsg');

  if(btnOpen) btnOpen.addEventListener('click', () => {
    if(!supabase) {
      alert("Supabase non è ancora configurato. Aggiungi le chiavi nel file .env!");
      return;
    }
    errorMsg.style.display = 'none';
    modal.classList.add('open');
  });

  const togglePasswordVisibility = document.getElementById('togglePasswordVisibility');
  if (togglePasswordVisibility && passwordInput) {
    togglePasswordVisibility.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePasswordVisibility.className = type === 'password' ? 'ri-eye-line' : 'ri-eye-off-line';
    });
  }

  const handleAuth = async (isSignUp) => {
    errorMsg.style.display = 'none';
    const email = emailInput.value;
    const password = passwordInput.value;
    if(!email || !password) {
      errorMsg.textContent = "Inserisci email e password.";
      errorMsg.style.display = 'block';
      return;
    }
    
    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
      
    if(error) {
      errorMsg.textContent = error.message;
      errorMsg.style.display = 'block';
    } else {
      emailInput.value = '';
      passwordInput.value = '';
      if(isSignUp) {
        errorMsg.textContent = "Controlla la tua email per confermare l'account!";
        errorMsg.style.display = 'block';
        errorMsg.style.color = '#38bd71';
      } else {
        // Force update UI locally
        const { data } = await supabase.auth.getSession();
        if (data && data.session) {
          currentUser = data.session.user;
          await fetchCloudData();
          const btn = document.getElementById('openAuthModalBtn');
          const statusContainer = document.getElementById('authStatusContainer');
          const emailDisplay = document.getElementById('authEmailDisplay');
          if (btn) btn.style.display = 'none';
          if (statusContainer) statusContainer.style.display = 'block';
          if (emailDisplay) emailDisplay.textContent = currentUser.email;
        }
        closeModals(); // Chiudi il modal al login avvenuto con successo
      }
    }
  };

  if(btnLogin) btnLogin.addEventListener('click', () => handleAuth(false));
  if(btnSignup) btnSignup.addEventListener('click', () => handleAuth(true));
  if(btnLogout) btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

// --- Theme Logic ---
function applyTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  localStorage.setItem('varcity_theme', theme);
  
  if (theme === 'dark') {
    themeIcon.className = 'ri-sun-line';
    metaThemeColor.content = '#000000';
  } else {
    themeIcon.className = 'ri-moon-line';
    metaThemeColor.content = '#f5f5f7';
  }
  
  if(trendChartInstance) {
    updateChart(); 
  }
}

function setupThemeToggle() {
  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
  });
}

// --- Navigation Logic ---
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      viewSections.forEach(section => section.classList.remove('active'));
      
      item.classList.add('active');
      const targetView = document.getElementById(`view-${item.dataset.view}`);
      if (targetView) {
        targetView.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// --- Curriculum Form Logic ---
function updateCurriculumFormVisibility() {
  const status = inputStatus.value;
  const type = inputType.value;

  if (status === 'passed') {
    dateGroup.style.display = 'block';
    inputDate.required = true;
    appelliGroup.style.display = 'none';
    document.getElementById('unconfirmed-group').style.display = 'none';
    
    if (type === 'standard') {
      gradeRow.style.display = 'flex';
      inputGrade.required = true;
    } else {
      gradeRow.style.display = 'none';
      inputGrade.required = false;
    }
  } else {
    // planned
    dateGroup.style.display = 'none';
    inputDate.required = false;
    appelliGroup.style.display = 'block';
    document.getElementById('unconfirmed-group').style.display = 'block';
    gradeRow.style.display = 'none';
    inputGrade.required = false;
  }
}

function setupCurriculumFormToggles() {
  inputStatus.addEventListener('change', updateCurriculumFormVisibility);
  inputType.addEventListener('change', updateCurriculumFormVisibility);
}

// --- Settings Logic ---
function setupSettings() {
  const selectLode = document.getElementById('settings-lode-weight');
  const inputUsername = document.getElementById('settings-username');
  const inputUniversity = document.getElementById('settings-university');
  const inputDegreeName = document.getElementById('settings-degree-name');
  
  selectLode.value = lodeWeight.toString();
  inputUsername.value = userName;
  inputUniversity.value = userUniversity;
  inputDegreeName.value = userDegreeName;

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    lodeWeight = parseInt(selectLode.value);
    userName = inputUsername.value.trim();
    userUniversity = inputUniversity.value.trim();
    userDegreeName = inputDegreeName.value.trim();
    
    localStorage.setItem('varcity_lode_weight', lodeWeight);
    localStorage.setItem('varcity_username', userName);
    localStorage.setItem('varcity_university', userUniversity);
    localStorage.setItem('varcity_degree_name', userDegreeName);
    
    
    updateUI(); 
  });
}

window.onerror = function(message, source, lineno, colno, error) {
  alert("JS Error: " + message + "\nLine: " + lineno);
};

// --- Modals Logic ---
const openModal = (modal) => modal.classList.add('open');
const closeModals = () => {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
};

function setupModals() {
  // Triggers
  document.getElementById('btn-add-curriculum').addEventListener('click', () => {
    formAddCurriculum.reset();
    inputEditingId.value = '';
    document.getElementById('btn-delete-curriculum').style.display = 'none';
    updateCurriculumFormVisibility();
    openModal(modalAddCurriculum);
  });
  
  // Reorder Toggle
  document.getElementById('btn-toggle-reorder').addEventListener('click', (e) => {
    isReorderMode = !isReorderMode;
    e.currentTarget.style.backgroundColor = isReorderMode ? 'var(--text-main)' : '';
    e.currentTarget.style.color = isReorderMode ? 'var(--bg-main)' : '';
    updateUI();
  });
  
  // PDF Wizard
  const modalImportPdf = document.getElementById('modal-import-pdf');
  const step1 = document.getElementById('import-step-1');
  const step2 = document.getElementById('import-step-2');
  const step3 = document.getElementById('import-step-3');
  const importFile = document.getElementById('import-file');
  const importLoading = document.getElementById('import-loading');

  let extractedPdfExams = [];
  let pdfCurricula = [];
  let fullPdfText = "";

  document.getElementById('btn-import-pdf').addEventListener('click', () => {
    step1.style.display = 'block';
    step2.style.display = 'none';
    step3.style.display = 'none';
    importLoading.style.display = 'none';
    importFile.value = '';
    extractedPdfExams = [];
    pdfCurricula = [];
    fullPdfText = "";
    openModal(modalImportPdf);
  });

  document.getElementById('btn-close-import').addEventListener('click', () => {
    modalImportPdf.classList.remove('open');
  });

  importFile.addEventListener('change', async (e) => {
    if(importFile.files.length > 0) {
      importLoading.style.display = 'block';
      
      try {
        const file = importFile.files[0];
        const arrayBuffer = await file.arrayBuffer();
        
        if (window.pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
          
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = "";

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(" ") + "\\n";
          }
          
          fullPdfText = fullText;

          // 1. Estrai i Curriculum dinamicamente (trova tutti i CURRICULUM IN "...")
          const currRegex = /CURRICULUM IN "([^"]+)"/gi;
          let match;
          while ((match = currRegex.exec(fullText)) !== null) {
            if (!pdfCurricula.includes(match[1])) {
              pdfCurricula.push(match[1]);
            }
          }

          // Popola la select dei percorsi
          const pathSelect = document.getElementById('import-path');
          pathSelect.innerHTML = '';
          if (pdfCurricula.length > 0) {
            pdfCurricula.forEach((c, index) => {
              const opt = document.createElement('option');
              opt.value = index.toString();
              opt.textContent = c;
              pathSelect.appendChild(opt);
            });
          } else {
            // Fallback
            pathSelect.innerHTML = '<option value="0">Percorso Unico</option>';
          }
        }
      } catch (err) {
        console.error("Errore lettura PDF:", err);
      }

      step1.style.display = 'none';
      step2.style.display = 'block';
    }
  });

  document.getElementById('btn-import-next-1').addEventListener('click', () => {
    step2.style.display = 'none';
    step3.style.display = 'block';
    
    // Genera scelte dinamiche in base al percorso selezionato
    const pathSelect = document.getElementById('import-path');
    const selectedCurriculum = pathSelect.options[pathSelect.selectedIndex].text;
    
    const electivesContainer = document.getElementById('electives-container');
    electivesContainer.innerHTML = ''; // Clear previous

    // Funzione per formattare i titoli in Title Case (Capitalize words, tranne connettivi)
    function toTitleCase(str) {
      const lowers = ['e', 'ed', 'o', 'del', 'della', 'delle', 'dei', 'degli', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle', 'l', 'd', 'dell', 'all', 'nell', 'sull', 'un'];
      return str.toLowerCase().split(' ').map((word, index) => {
        if (word.includes("'")) {
          const parts = word.split("'");
          if (lowers.includes(parts[0])) {
             if (index === 0) {
                 return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + "'" + (parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '');
             }
             return parts[0] + "'" + (parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '');
          }
        }
        if (index !== 0 && lowers.includes(word)) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ').replace(/"/g, '');
    }

    // Creiamo un database interno per il corso "Direzione Aziendale" per generare le materie corrette e i rispettivi anni
    const db = {
      "REPORTING E CONTROLLO": {
        core: [
          { s: "Analisi di bilancio e comunicazione finanziaria", c: 9, y: 1, sem: 1 },
          { s: "Pianificazione economico-finanziaria", c: 9, y: 1, sem: 1 },
          { s: "Revisione aziendale", c: 9, y: 1, sem: 2 },
          { s: "Operazioni straordinarie e bilanci consolidati", c: 9, y: 2, sem: 1 },
          { s: "Controllo di gestione", c: 9, y: 2, sem: 2 }
        ],
        scelte: [
          { opts: ["Economia dei Mercati Internazionali (9)", "Economia industriale (9)"], y: 1, sem: 1 },
          { opts: ["Economia e Regolamentazione dei Mercati (9)", "Politiche europee per l'integrazione dei mercati (9)"], y: 1, sem: 2 },
          { opts: ["Diritto della crisi d'impresa e della ristrutturazione dei debito (9)", "Corporate e Investment Banking (9)", "Start up Strategy e Business Plan (9)", "Sustainable finance and ESG Risk management (9)"], y: 1, sem: 2 },
          { opts: ["Diritto delle società quotate e dei Mercati finanziari (6)", "Diritto del lavoro e del Management privato e pubblico (6)"], y: 2, sem: 1 },
          { opts: ["Statistica per il Business (9)"], y: 2, sem: 1 },
          { opts: ["Internal auditing e business intelligence (6)", "Contabilità nelle amministrazioni e nelle aziende pubbliche (6)", "Diritto dei contratti d'impresa (6)", "Management delle aziende sanitarie (6)"], y: 2, sem: 1 }
        ]
      },
      "IMPRENDITORIALITÀ E INNOVAZIONE": {
        core: [
          { s: "Analisi di bilancio e gestione delle performance", c: 9, y: 1, sem: 1 },
          { s: "Start up Strategy e Business Plan", c: 9, y: 1, sem: 2 },
          { s: "Reporting per le decisioni", c: 9, y: 2, sem: 2 }
        ],
        scelte: [
          { opts: ["Business model innovation (9)", "Management dell'innovazione (9)"], y: 1, sem: 1 },
          { opts: ["Economia dei Mercati Internazionali (9)", "Economia industriale (9)"], y: 1, sem: 1 },
          { opts: ["Economia e Regolamentazione dei Mercati (9)", "Politiche europee per l'integrazione dei mercati (9)"], y: 1, sem: 2 },
          { opts: ["Diritto della crisi d'impresa e della ristrutturazione dei debito (9)", "Corporate e Investment Banking (9)", "Storia d'impresa (9)", "Decision analysis in management (9)"], y: 1, sem: 2 },
          { opts: ["Pianificazione economico-finanziaria (9)", "Digital marketing (9)"], y: 2, sem: 1 },
          { opts: ["Diritto delle società quotate e dei Mercati finanziari (6)", "Diritto del lavoro e del Management privato e pubblico (6)"], y: 2, sem: 1 },
          { opts: ["Statistica per il Business (9)", "Metodi statistici per l'analisi di mercato e il marketing (9)"], y: 2, sem: 1 },
          { opts: ["Circular Economy e strumenti di management ambientale (6)", "Accounting information systems (6)", "Diritto dei contratti d'impresa (6)", "Management delle aziende sanitarie (6)"], y: 2, sem: 1 }
        ]
      },
      "MARKETING MANAGEMENT": {
        core: [
          { s: "Brand management", c: 9, y: 1, sem: 1 },
          { s: "International business", c: 9, y: 1, sem: 1 },
          { s: "Logistica Distributiva e Omnicanalità", c: 9, y: 1, sem: 2 },
          { s: "Business model innovation", c: 9, y: 2, sem: 1 },
          { s: "Digital marketing", c: 9, y: 2, sem: 2 }
        ],
        scelte: [
          { opts: ["Economia dei Mercati Internazionali (9)", "Economia industriale (9)"], y: 1, sem: 1 },
          { opts: ["Economia e Regolamentazione dei Mercati (9)", "Politiche europee per l'integrazione dei mercati (9)"], y: 1, sem: 2 },
          { opts: ["Diritto della crisi d'impresa e della ristrutturazione dei debito (9)", "Reporting per le decisioni (9)", "Storia d'impresa (9)", "Decision analysis in management (9)"], y: 1, sem: 2 },
          { opts: ["Diritto delle società quotate e dei Mercati finanziari (6)", "Diritto del lavoro e del Management privato e pubblico (6)"], y: 2, sem: 1 },
          { opts: ["Statistica per il Business (9)", "Metodi statistici per l'analisi di mercato e il marketing (9)"], y: 2, sem: 1 },
          { opts: ["Circular Economy e strumenti di management ambientale (6)", "Accounting information systems (6)", "Diritto dei contratti d'impresa (6)", "Impresa, Finanza ed Etica (6)"], y: 2, sem: 1 }
        ]
      },
      "MANAGEMENT DELLA SOSTENIBILITA' E DEL TURISMO": {
        core: [
          { s: "Analisi di bilancio e gestione delle performance", c: 9, y: 1, sem: 1 },
          { s: "Management delle imprese e dei servizi turistici", c: 9, y: 1, sem: 1 },
          { s: "Tourism economics", c: 9, y: 1, sem: 1 },
          { s: "Digital marketing", c: 9, y: 1, sem: 2 },
          { s: "Economia e politiche culturali", c: 9, y: 1, sem: 2 },
          { s: "Reporting per le decisioni", c: 9, y: 2, sem: 2 }
        ],
        scelte: [
          { opts: ["Gestione sostenibile delle risorse naturali (9)", "Geografia del turismo (9)", "Start up Strategy e Business Plan (9)"], y: 1, sem: 2 },
          { opts: ["Pianificazione economico-finanziaria (9)", "Destination management e marketing (9)"], y: 2, sem: 1 },
          { opts: ["Diritto dei servizi turistici (6)", "Diritto del lavoro e del Management privato e pubblico (6)"], y: 2, sem: 1 },
          { opts: ["Statistica per il Business (9)", "Metodi statistici per l'analisi di mercato e il marketing (9)"], y: 2, sem: 1 },
          { opts: ["Circular Economy e strumenti di management ambientale (6)", "Misurazione e rendicontazione sociale ed ambientale (6)", "Diritto dei contratti d'impresa (6)"], y: 2, sem: 1 }
        ]
      }
    };

    extractedPdfExams = []; // Reset
    const currData = db[selectedCurriculum];
    
    if (currData) {
      // Aggiungi esami core
      currData.core.forEach((esame, i) => {
        extractedPdfExams.push({ id: Date.now()+'c'+i, status: 'planned', type: 'standard', subject: toTitleCase(esame.s), credits: esame.c, year: esame.y, semester: esame.sem, appelli: '' });
      });
      // Aggiungi elementi base (Tesi, UAF)
      extractedPdfExams.push({ id: Date.now()+'t', status: 'planned', type: 'tesi', subject: 'Tesi', credits: 14, year: 2, semester: 2, appelli: '' });
      extractedPdfExams.push({ id: Date.now()+'u', status: 'planned', type: 'uaf', subject: 'Ulteriori Attività Formative', credits: 4, year: 2, semester: 2, appelli: '' });
      extractedPdfExams.push({ id: Date.now()+'l', status: 'planned', type: 'standard', subject: 'Insegnamento a Scelta', credits: 9, year: 2, semester: 2, appelli: '' });

      // Crea UI per le materie a scelta
      currData.scelte.forEach((gruppo, indexG) => {
        const groupDiv = document.createElement('div');
        groupDiv.style.marginBottom = '1rem';
        groupDiv.innerHTML = `<p style="font-size:0.9rem; margin-bottom:4px; font-weight:600;">Scegli 1 opzione (Anno ${gruppo.y} - Sem ${gruppo.sem}):</p>`;
        
        gruppo.opts.forEach((materia, indexM) => {
          const div = document.createElement('div');
          div.className = 'form-check';
          // Estrai nome e cfu con regex fissa per JS (usando RegExp per evitare problemi di escape)
          const rx = new RegExp('(.+)\\\\s\\\\((\\\\d+)\\\\)');
          const match = materia.match(rx) || materia.match(/(.+)\s\((\d+)\)/);
          const nome = match ? match[1].trim() : materia;
          const cfu = match ? parseInt(match[2]) : 6;
          
          const nomeTitleCase = toTitleCase(nome);
          
          div.innerHTML = `
            <input type="radio" name="gruppo_${indexG}" id="scelta_${indexG}_${indexM}" value="${nomeTitleCase}|${cfu}|${gruppo.y}|${gruppo.sem}" ${indexM===0?'checked':''} />
            <label for="scelta_${indexG}_${indexM}">${nomeTitleCase}</label>
          `;
          groupDiv.appendChild(div);
        });
        electivesContainer.appendChild(groupDiv);
      });
    } else {
      electivesContainer.innerHTML = '<p>Nessuna materia a scelta configurata per questo percorso.</p>';
    }
  });

  document.getElementById('btn-import-finish').addEventListener('click', () => {
    // Raccogli tutte le scelte fatte dai radio button
    const electivesContainer = document.getElementById('electives-container');
    const checkedRadios = electivesContainer.querySelectorAll('input[type="radio"]:checked');
    
    checkedRadios.forEach((radio, i) => {
      const parts = radio.value.split('|');
      const subject = parts[0];
      const creditsStr = parts[1];
      const yearStr = parts[2];
      const semStr = parts[3];
      extractedPdfExams.push({ 
        id: Date.now()+'sel'+i, 
        status: 'planned', 
        type: 'standard', 
        subject: subject, 
        credits: parseInt(creditsStr), 
        year: parseInt(yearStr) || 2, 
        semester: parseInt(semStr) || 1,
        appelli: '' 
      });
    });

    // Aggiungi tutto al curriculum
    extractedPdfExams.forEach(e => curriculum.push(e));
    saveAll('varcity_curriculum', curriculum);
    modalImportPdf.classList.remove('open');
  });
  
  document.getElementById('btn-add-lesson').addEventListener('click', openLessonModal);
  document.getElementById('btn-add-tax').addEventListener('click', () => openModal(modalAddTax));
  

  // Closes
  document.querySelectorAll('.btn-close').forEach(btn => btn.addEventListener('click', closeModals));
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) closeModals(); });
  });

  // Forms Submits
  formAddCurriculum.addEventListener('submit', (e) => {
    e.preventDefault();
    const editingId = inputEditingId.value;
    const status = inputStatus.value;
    const type = inputType.value;
    
    let grade = null;
    let isLode = false;
    
    if (status === 'passed' && type === 'standard') {
      grade = parseInt(inputGrade.value);
      isLode = inputLode.checked;
      if (isLode) grade = lodeWeight;
      if (grade > lodeWeight && !isLode) grade = lodeWeight;
    }

    const newItem = {
      id: editingId ? editingId : Date.now().toString(),
      status: status,
      type: type,
      year: parseInt(inputYear.value),
      semester: parseInt(inputSemester.value),
      subject: inputSubject.value,
      credits: parseInt(inputCredits.value),
      grade: grade,
      isLode: isLode,
      date: status === 'passed' ? inputDate.value : null,
      appelli: status === 'planned' ? inputAppelli.value : '',
      unconfirmed: status === 'planned' ? inputUnconfirmed.checked : false
    };

    if (editingId) {
      curriculum = curriculum.map(item => item.id === editingId ? newItem : item);
    } else {
      curriculum.push(newItem);
    }
    
    saveAll('varcity_curriculum', curriculum);
    formAddCurriculum.reset();
    inputEditingId.value = '';
    updateCurriculumFormVisibility();
    closeModals();
  });

  formAddLesson.addEventListener('submit', (e) => {
    e.preventDefault();
    let subjectName = document.getElementById('lesson-subject').value;
    if (subjectName === 'Altro...') {
      subjectName = prompt("Inserisci il nome della materia:");
      if (!subjectName || subjectName.trim() === '') return;
    }
    lessons.push({
      id: Date.now().toString(),
      subject: subjectName.trim(),
      day: parseInt(document.getElementById('lesson-day').value),
      room: document.getElementById('lesson-room').value,
      start: document.getElementById('lesson-start').value,
      end: document.getElementById('lesson-end').value,
    });
    lessons.sort((a, b) => {
      if (a.day === b.day) return a.start.localeCompare(b.start);
      return a.day - b.day;
    });
    saveAll('varcity_schedule', lessons);
    formAddLesson.reset();
    closeModals();
  });

  formAddTax.addEventListener('submit', (e) => {
    e.preventDefault();
    taxes.push({
      id: Date.now().toString(),
      desc: document.getElementById('tax-desc').value,
      amount: parseFloat(document.getElementById('tax-amount').value),
      date: document.getElementById('tax-date').value,
      paid: document.getElementById('tax-paid').checked
    });
    taxes.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveAll('varcity_taxes', taxes);
    formAddTax.reset();
    closeModals();
  });
}

// --- Editing Helper ---
window.editCurriculumItem = function(id) {
  const item = curriculum.find(c => c.id === id);
  if (!item) return;

  inputEditingId.value = item.id;
  inputStatus.value = item.status;
  inputType.value = item.type || 'standard';
  inputYear.value = item.year || 1;
  inputSemester.value = item.semester !== undefined ? item.semester : 1;
  inputSubject.value = item.subject;
  inputCredits.value = item.credits;
  
  if (item.status === 'passed') {
    if (item.grade) inputGrade.value = item.isLode ? 30 : item.grade;
    inputLode.checked = !!item.isLode;
    if (item.date) inputDate.value = item.date;
  } else {
    inputAppelli.value = item.appelli || '';
    inputUnconfirmed.checked = item.unconfirmed || false;
  }

  const btnDelete = document.getElementById('btn-delete-curriculum');
  btnDelete.style.display = 'block';
  btnDelete.onclick = () => {
    if (confirm('Eliminare questo elemento dal curriculum?')) {
      curriculum = curriculum.filter(c => c.id !== id);
      saveAll('varcity_curriculum', curriculum);
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    }
  };

  updateCurriculumFormVisibility();
  modalAddCurriculum.classList.add('open');
}

// --- Math & Calculations ---
function calculateStats(currArray) {
  let totalCredits = 0; 
  let creditsForGpa = 0; 
  let sumWeighted = 0;
  let sumGrades = 0;
  let countForGpa = 0;
  let passedCount = 0;
  
  let globalTotalCredits = 0;
  let globalTotalExamsCount = 0;

  currArray.forEach(item => {
    globalTotalCredits += item.credits;
    if (!item.type || item.type === 'standard') {
      globalTotalExamsCount++;
    }

    if (item.status === 'passed') {
      totalCredits += item.credits;
      
      if (!item.type || item.type === 'standard') {
        passedCount++;
        creditsForGpa += item.credits;
        const calcGrade = (item.isLode) ? lodeWeight : item.grade;
        sumWeighted += calcGrade * item.credits;
        sumGrades += calcGrade;
        countForGpa++;
      }
    }
  });

  const weightedGpa = creditsForGpa > 0 ? (sumWeighted / creditsForGpa) : 0;
  const arithmeticGpa = countForGpa > 0 ? (sumGrades / countForGpa) : 0;
  
  return { 
    totalCredits, 
    count: passedCount, 
    weightedGpa, 
    arithmeticGpa, 
    globalTotalCredits, 
    globalTotalExamsCount 
  };
}

// --- Quick Simulator ---
function setupSimulator() {
  btnQuickSim.addEventListener('click', () => {
    const simGrade = parseInt(document.getElementById('quick-sim-grade').value);
    const simCredits = parseInt(document.getElementById('quick-sim-credits').value);

    if (isNaN(simGrade) || isNaN(simCredits)) return;
    
    const simExams = [...curriculum, { status: 'passed', type: 'standard', grade: simGrade, credits: simCredits, isLode: simGrade>30 }];
    const newStats = calculateStats(simExams);
    quickSimResult.textContent = `Nuova media: ${newStats.weightedGpa.toFixed(2)}`;
  });

  const btnQuickSimReset = document.getElementById('btn-quick-sim-reset');
  if (btnQuickSimReset) {
    btnQuickSimReset.addEventListener('click', () => {
      document.getElementById('quick-sim-grade').value = '';
      document.getElementById('quick-sim-credits').value = '';
      quickSimResult.textContent = 'Nuova media: -';
    });
  }
}

// --- Widgets ---
function updateNextLessonWidget() {
  if (lessons.length === 0) {
    widgetNextLesson.innerHTML = `<div class="lesson-preview"><p class="widget-sub">Nessuna lezione in programma.</p></div>`;
    return;
  }

  const d = new Date();
  let currentDay = d.getDay(); 
  if (currentDay === 0) currentDay = 7; 
  const currentTime = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');

  let next = lessons.find(l => {
    if (l.day === currentDay && l.start > currentTime) return true;
    if (l.day > currentDay) return true;
    return false;
  });

  if (!next) next = lessons[0]; 

  const daysStr = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  let timeStr = next.day === currentDay ? `Oggi, ${next.start}` : `${daysStr[next.day]}, ${next.start}`;

  widgetNextLesson.innerHTML = `
    <div class="lesson-preview">
      <h4 style="font-size: 1rem; margin-bottom: 2px;">${next.subject}</h4>
      <p class="widget-sub">${timeStr} &bull; ${next.room}</p>
    </div>
  `;
}

function updateNextTaxWidget() {
  const unpaid = taxes.filter(t => !t.paid);
  if (unpaid.length === 0) {
    widgetNextTax.innerHTML = `<div class="lesson-preview"><p class="widget-sub">Nessuna scadenza imminente.</p></div>`;
    return;
  }
  
  const next = unpaid[0]; // Already sorted
  const formattedDate = new Date(next.date).toLocaleDateString('it-IT');
  const isOverdue = new Date(next.date) < new Date();
  const color = isOverdue ? 'color: #ff3b30;' : 'color: var(--accent);';

  widgetNextTax.innerHTML = `
    <div class="lesson-preview">
      <h4 style="font-size: 1rem; margin-bottom: 2px;">${next.desc}</h4>
      <p style="${color} font-weight: 600;">€${next.amount.toFixed(2)} &bull; ${formattedDate}</p>
    </div>
  `;
}

// --- Chart Logic ---
function updateChart() {
  const ctx = document.getElementById('trend-chart').getContext('2d');
  
  // Sort passed exams by date ASC for timeline chart
  const passedExams = curriculum
    .filter(e => e.status === 'passed' && (!e.type || e.type === 'standard'))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let currentCredits = 0;
  let currentSum = 0;
  
  const labels = [];
  const dataPoints = [];

  passedExams.forEach((exam, index) => {
    currentCredits += exam.credits;
    currentSum += (exam.isLode ? lodeWeight : exam.grade) * exam.credits;
    
    labels.push(exam.name);
    dataPoints.push((currentSum / currentCredits).toFixed(2));
  });

  const lineColor = currentTheme === 'dark' ? '#ffffff' : '#000000';
  const gridColor = currentTheme === 'dark' ? '#2c2c2c' : '#e5e5ea';
  const tooltipBg = currentTheme === 'dark' ? '#2c2c2c' : '#ffffff';
  const tooltipText = currentTheme === 'dark' ? '#ffffff' : '#000000';
  const tooltipBorder = currentTheme === 'dark' ? '#38383a' : '#e5e5ea';

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Media Ponderata',
        data: dataPoints,
        borderColor: lineColor,
        backgroundColor: lineColor,
        borderWidth: 3,
        pointBackgroundColor: lineColor,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHitRadius: 15,
        fill: false,
        tension: 0.5,
        borderCapStyle: 'round',
        borderJoinStyle: 'round'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          titleFont: { size: 13, family: 'Inter' },
          bodyFont: { size: 14, weight: 'bold', family: 'Inter' },
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          cornerRadius: 12,
          callbacks: {
            label: function(context) {
              return context.parsed.y.toFixed(2);
            }
          }
        }
      },
      scales: {
        y: {
          min: 18,
          max: 30, // MAX 30 come da specifiche
          grid: { color: gridColor },
          ticks: { color: '#a0a0a0' }
        },
        x: {
          display: false,
        }
      }
    }
  });
}

function setupChartToggle() {
  const btnToggleChart = document.getElementById('btn-toggle-chart');
  const widgetChart = document.getElementById('widget-chart-container');
  let isChartExpanded = false;

  if (!btnToggleChart || !widgetChart) return;

  btnToggleChart.addEventListener('click', () => {
    isChartExpanded = !isChartExpanded;
    widgetChart.style.height = isChartExpanded ? '250px' : '110px';
    
    // Rotate the icon
    const icon = document.getElementById('chart-toggle-icon');
    if (icon) {
      icon.style.transform = isChartExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
      icon.style.transition = 'transform 0.3s ease';
    }

    // Resize chart after container animation
    setTimeout(() => {
      if (trendChartInstance) {
        trendChartInstance.resize();
      }
    }, 300);
  });
}


// --- UI Updates ---
function updateUI() {
  const greetingEl = document.getElementById('greeting-text');
  const widgetUserInfo = document.getElementById('widget-user-info');
  const widgetUserText = document.getElementById('widget-user-text');
  
  if (userName) {
    greetingEl.textContent = `Bentornato, ${userName}.`;
  } else {
    greetingEl.textContent = 'Overview.';
  }

  const subParts = [];
  if (userUniversity) subParts.push(userUniversity);
  if (userDegreeName) subParts.push(userDegreeName);
  
  if (subParts.length > 0) {
    widgetUserText.textContent = subParts.join(' • ');
    widgetUserInfo.style.display = 'inline-flex';
  } else {
    widgetUserInfo.style.display = 'none';
  }

  renderCurriculumList();
  renderScheduleList();
  renderTaxesList();
  updateStats();
  updateNextLessonWidget();
  updateNextTaxWidget();
  updateChart();
}

function updateStats() {
  const stats = calculateStats(curriculum);
  statWeighted.textContent = stats.weightedGpa.toFixed(2);
  statArithmetic.textContent = `Aritmetica: ${stats.arithmeticGpa.toFixed(2)}`;
  const cfuPercent = stats.globalTotalCredits > 0 ? Math.round((stats.totalCredits / stats.globalTotalCredits) * 100) : 0;
  const examsPercent = stats.globalTotalExamsCount > 0 ? Math.round((stats.count / stats.globalTotalExamsCount) * 100) : 0;
  
  statCredits.textContent = stats.totalCredits;
  const statCreditsTotal = document.getElementById('stat-credits-total');
  if (statCreditsTotal) statCreditsTotal.textContent = `/ ${stats.globalTotalCredits} (${cfuPercent}%)`;
  
  statExamsCount.textContent = stats.count;
  const statExamsTotal = document.getElementById('stat-exams-total');
  if (statExamsTotal) statExamsTotal.textContent = `/ ${stats.globalTotalExamsCount} (${examsPercent}%)`;
}

function renderCurriculumList() {
  if (curriculum.length === 0) {
    planList.innerHTML = `<div class="empty-state">Il tuo curriculum è vuoto. Aggiungi il tuo primo esame!</div>`;
    return;
  }
  
  planList.innerHTML = '';
  
  // Group by year and semester
  const groupedByYear = {};
  curriculum.forEach(item => {
    const y = item.year || 1;
    if (!groupedByYear[y]) groupedByYear[y] = {};
    const s = item.semester !== undefined ? item.semester : 1;
    if (!groupedByYear[y][s]) groupedByYear[y][s] = [];
    groupedByYear[y][s].push(item);
  });
  
  // Sort years
  const years = Object.keys(groupedByYear).sort((a,b) => parseInt(a) - parseInt(b));

  years.forEach((y, yearIndex) => {
    const yearLabel = y == 7 ? 'Fuoricorso' : `${y}° Anno`;
    
    // Create Year Header
    const yearHeader = document.createElement('h2');
    yearHeader.className = 'year-header';
    yearHeader.style.marginTop = (yearIndex === 0) ? '0' : '2rem';
    yearHeader.style.marginBottom = '1rem';
    yearHeader.style.fontSize = '1.4rem';
    yearHeader.style.color = 'var(--text-main)';
    yearHeader.style.borderBottom = '1px solid var(--border-color)';
    yearHeader.style.paddingBottom = '8px';
    yearHeader.textContent = yearLabel;
    planList.appendChild(yearHeader);

    // Semesters
    const semesters = Object.keys(groupedByYear[y]).sort((a,b) => {
      const aVal = parseInt(a);
      const bVal = parseInt(b);
      if (aVal === 0) return 1;
      if (bVal === 0) return -1;
      return aVal - bVal;
    });
    
    semesters.forEach(s => {
      // Create Semester Header if not 0
      if (s != 0) {
        const semLabel = s == 1 ? 'I Semestre' : 'II Semestre';
        const semHeader = document.createElement('h3');
        semHeader.style.marginTop = '1.2rem';
        semHeader.style.marginBottom = '0.8rem';
        semHeader.style.fontSize = '1.1rem';
        semHeader.style.color = 'var(--text-muted)';
        semHeader.textContent = semLabel;
        planList.appendChild(semHeader);
      }

      // Maintain manual order (order in curriculum array)
      const items = groupedByYear[y][s];

      items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'list-item';
      if (item.status === 'planned') {
        el.style.opacity = '0.6'; // Dim planned items
        el.style.borderStyle = 'dashed'; // Optional visual distinction
      }

      let displayGrade = '';
      if (item.status === 'passed') {
        if (!item.type || item.type === 'standard') {
          displayGrade = item.isLode ? '30L' : item.grade;
        } else if (item.type === 'idoneita') displayGrade = 'Idon.';
        else if (item.type === 'uaf') displayGrade = 'UAF';
        else if (item.type === 'tesi') displayGrade = 'Tesi';
      }

      const formattedDate = item.status === 'passed' && item.date 
        ? new Date(item.date).toLocaleDateString('it-IT') 
        : '';
        
      const appelliHtml = item.status === 'planned' && item.appelli 
        ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Appelli: ${item.appelli}</div>` 
        : '';

      const mainMeta = item.status === 'passed' 
        ? `${item.credits} CFU &bull; ${formattedDate}`
        : `${item.credits} CFU`;

      const unconfirmedBadge = item.unconfirmed 
        ? `<span style="display:inline-block; font-size:0.65rem; background-color:var(--accent); color:var(--accent-inverse); padding:2px 6px; border-radius:12px; margin-left:8px; vertical-align:middle;">In attesa di conferma</span>` 
        : '';

      const dragHandle = isReorderMode 
        ? `<div class="drag-handle" style="cursor:grab; font-size:1.4rem; color:var(--text-muted); margin-right:0.5rem; display:flex; align-items:center;"><i class="ri-draggable"></i></div>`
        : '';

      el.className = 'list-item' + (isReorderMode ? ' draggable-item' : '');
      if (isReorderMode) {
        el.draggable = true;
        el.dataset.id = item.id;
      }

      const quickPassBtn = item.status === 'planned' && !isReorderMode
        ? `<button class="icon-btn pass-curr" data-id="${item.id}" title="Segna come superato" style="padding:0; min-height:0; width:28px; height:28px;">
             <i class="ri-checkbox-circle-line" style="font-size:1.3rem; color:var(--accent);"></i>
           </button>`
        : '';

      el.innerHTML = `
        ${dragHandle}
        <div class="item-info" ${!isReorderMode ? `onclick="editCurriculumItem('${item.id}')"` : ''} style="${!isReorderMode ? 'cursor:pointer;' : ''} flex: 1;">
          <h4>${item.subject}${unconfirmedBadge}</h4>
          <div class="item-meta">${mainMeta}</div>
          ${appelliHtml}
        </div>
        <div style="display:flex; align-items:center; gap: 0.5rem;">
          ${quickPassBtn}
          <div class="item-value" style="font-size: 1.1rem; margin-right: 0.5rem;">
            ${item.status === 'passed' ? displayGrade : '<i class="ri-calendar-todo-line"></i>'}
          </div>
        </div>
      `;
      planList.appendChild(el);
      });
    });
  });

  // Attach quick pass handlers
  document.querySelectorAll('.pass-curr').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      window.editCurriculumItem(id);
      document.getElementById('input-status').value = 'passed';
      updateCurriculumFormVisibility();
    });
  });

  // Attach Drag & Drop handlers if in reorder mode
  if (isReorderMode) {
    let draggedElement = null;

    document.querySelectorAll('.draggable-item').forEach(item => {
      item.addEventListener('dragstart', function(e) {
        draggedElement = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
        setTimeout(() => this.style.opacity = '0.5', 0);
      });

      item.addEventListener('dragend', function() {
        this.style.opacity = '1';
        document.querySelectorAll('.draggable-item').forEach(el => {
          el.style.borderTop = '';
          el.style.borderBottom = '';
        });
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
        const bounding = this.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        if (e.clientY - offset > 0) {
          this.style.borderBottom = '2px solid var(--accent)';
          this.style.borderTop = '';
        } else {
          this.style.borderTop = '2px solid var(--accent)';
          this.style.borderBottom = '';
        }
      });

      item.addEventListener('dragleave', function() {
        this.style.borderTop = '';
        this.style.borderBottom = '';
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderTop = '';
        this.style.borderBottom = '';
        if (draggedElement === this) return;

        const draggedId = draggedElement.dataset.id;
        const targetId = this.dataset.id;
        
        const draggedIdx = curriculum.findIndex(c => c.id === draggedId);
        const targetIdx = curriculum.findIndex(c => c.id === targetId);

        if (draggedIdx === -1 || targetIdx === -1) return;

        const draggedItem = curriculum[draggedIdx];
        const targetItem = curriculum[targetIdx];
        
        if (draggedItem.year === targetItem.year && draggedItem.semester === targetItem.semester) {
          const bounding = this.getBoundingClientRect();
          const offset = bounding.y + (bounding.height / 2);
          const insertAfter = (e.clientY - offset > 0);

          const itemToMove = curriculum.splice(draggedIdx, 1)[0];
          const newTargetIdx = curriculum.findIndex(c => c.id === targetId);
          
          if (insertAfter) {
            curriculum.splice(newTargetIdx + 1, 0, itemToMove);
          } else {
            curriculum.splice(newTargetIdx, 0, itemToMove);
          }
          saveAll('varcity_curriculum', curriculum);
        }
      });
    });
  }
}

function renderScheduleList() {
  if (lessons.length === 0) {
    scheduleList.innerHTML = `<div class="empty-state">Nessuna lezione in orario.</div>`;
    return;
  }
  const daysStr = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  scheduleList.innerHTML = '<div class="calendar-container"></div>';
  const calendarContainer = scheduleList.querySelector('.calendar-container');

  const grouped = {};
  lessons.forEach(lesson => {
    if (!grouped[lesson.day]) grouped[lesson.day] = [];
    grouped[lesson.day].push(lesson);
  });

  for (let i = 1; i <= 6; i++) {
    if (grouped[i] && grouped[i].length > 0) {
      const dayGroup = document.createElement('div');
      dayGroup.className = 'calendar-day-group';
      
      const dayHeader = document.createElement('div');
      dayHeader.className = 'calendar-day-header';
      dayHeader.innerHTML = `<h3>${daysStr[i]}</h3>`;
      dayGroup.appendChild(dayHeader);

      grouped[i].forEach(lesson => {
        const item = document.createElement('div');
        item.className = 'calendar-lesson-card';
        item.innerHTML = `
          <div class="calendar-lesson-time">
            <span class="time-start">${lesson.start}</span>
            <span class="time-end">${lesson.end}</span>
          </div>
          <div class="calendar-lesson-details">
            <h4>${lesson.subject}</h4>
            <div class="room"><i class="ri-map-pin-line"></i> ${lesson.room || 'N/A'}</div>
          </div>
          <button class="icon-btn delete-lesson" data-id="${lesson.id}">
            <i class="ri-delete-bin-line"></i>
          </button>
        `;
        dayGroup.appendChild(item);
      });
      calendarContainer.appendChild(dayGroup);
    }
  }

  document.querySelectorAll('.delete-lesson').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (confirm('Eliminare questa lezione?')) {
        lessons = lessons.filter(l => l.id !== e.currentTarget.dataset.id);
        saveAll('varcity_schedule', lessons);
      }
    });
  });
}

function renderTaxesList() {
  if (taxes.length === 0) {
    taxesList.innerHTML = `<div class="empty-state">Nessuna tassa inserita.</div>`;
    return;
  }
  taxesList.innerHTML = '';
  taxes.forEach(tax => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const formattedDate = new Date(tax.date).toLocaleDateString('it-IT');
    const statusIcon = tax.paid ? '<i class="ri-checkbox-circle-fill" style="color:var(--accent);"></i>' : '<i class="ri-error-warning-line" style="color:#ff3b30;"></i>';
    
    item.innerHTML = `
      <div class="item-info">
        <h4>${tax.desc} ${statusIcon}</h4>
        <div class="item-meta">Scadenza: ${formattedDate}</div>
      </div>
      <div style="display:flex; align-items:center; gap: 1rem;">
        <div class="item-value" style="font-size: 1.2rem;">€${tax.amount.toFixed(2)}</div>
        <button class="icon-btn delete-tax" data-id="${tax.id}">
          <i class="ri-delete-bin-line" style="font-size:1.2rem;"></i>
        </button>
      </div>
    `;
    taxesList.appendChild(item);
  });

  document.querySelectorAll('.delete-tax').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (confirm('Eliminare questa tassa?')) {
        taxes = taxes.filter(t => t.id !== e.currentTarget.dataset.id);
        saveAll('varcity_taxes', taxes);
      }
    });
  });
}

// Boot
function openLessonModal() {
  const subjectSelect = document.getElementById('lesson-subject');
  if (subjectSelect) {
    subjectSelect.innerHTML = '<option value="" disabled selected>Seleziona una materia...</option>';
    
    // Add custom option first
    const otherOption = document.createElement('option');
    otherOption.value = "Altro...";
    otherOption.textContent = "Altro... (inserisci manualmente)";
    subjectSelect.appendChild(otherOption);

    // Populate from curriculum
    const plannedExams = curriculum.filter(c => (!c.type || c.type === 'standard') && c.status !== 'passed');
    if (plannedExams.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = "In Piano di Studi";
      plannedExams.forEach(exam => {
        const option = document.createElement('option');
        option.value = exam.name;
        option.textContent = exam.name;
        optGroup.appendChild(option);
      });
      subjectSelect.appendChild(optGroup);
    }
    
    const passedExams = curriculum.filter(c => (!c.type || c.type === 'standard') && c.status === 'passed');
    if (passedExams.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = "Già superati";
      passedExams.forEach(exam => {
        const option = document.createElement('option');
        option.value = exam.name;
        option.textContent = exam.name;
        optGroup.appendChild(option);
      });
      subjectSelect.appendChild(optGroup);
    }
  }
  modalAddLesson.classList.add('open');
}

init();
