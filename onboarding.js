// onboarding.js

(function () {
  'use strict';

  // ── TRANSLATIONS ────────────────────────────────────────────────────────────
  const TRANSLATIONS = {
    he: {
      logoSub:              'לא עוד טעויות במידות',
      headline:             'לא עוד טעויות במידות!',
      subheadline:          '<strong>הצטרפו לפיילוט</strong> – הכנס את מידות גופך,<br/>ונציג לכם את <strong>המידה המתאימה בכל האתרים שאנו עובדים איתם</strong>',
      man:                  'גבר',
      woman:                'אישה',
      boy:                  'ילד',
      girl:                 'ילדה',
      height:               'גובה',
      bust:                 'חזה',
      waist:                'מותניים',
      hips:                 'ירכיים',
      emailPlaceholder:     'כתובת אימייל',
      profileNamePlaceholder: 'שם הפרופיל (השם המלא שלך)',
      joinBtn:              'הצטרפו לפיילוט',
      unitCm:               'ס"מ',
      unitInch:             "אינץ'",
      weight:               'משקל',
      age:                  'גיל',
      shapeInverted:        'כתפיים רחבות',
      shapeRect:            'מלבן',
      shapeTri:             'ירכיים רחבות',
      sizeRegion:           'באיזה מערכת מידות אתה קונה לרוב?',
      fitQuestion:          'איך אתה מעדיף שהבגד ישב?',
      fitSubtext:           'זה עוזר לנו לחשב את המרווח הנכון עבור המידות שלך.',
      tight:                'צמוד',
      tightSub:             'צמוד לגוף',
      regular:              'רגיל',
      regularSub:           'מידה סטנדרטית',
      loose:                'רפוי',
      looseSub:             'רפוי ומרווח',
      usualSizeQuestion:    'מה המידה שאתה בדרך כלל לובש?',
      usualSizeSub:         'זה יעזור לנו לשפר את ההמלצות שלנו',
      continueBtn:          'המשך →',
      successTitle:         'הכל מוכן!',
      successBody:          'SizeFitMe פעיל כעת. בקר בעמוד מוצר ב-AliExpress או SHEIN ונדגיש את המידה הטובה ביותר שלך אוטומטית.',
      startShopping:        'התחל לקנות',
      supportedOn:          'נתמך באתרים:',
      errEmail:             'נא להכניס כתובת אימייל תקינה.',
      errMeasure:           'נא להגדיר מידות ריאליסטיות לפני המשך.',
    },
    en: {
      logoSub:              'NO MORE MISTAKES AT SIZES',
      headline:             'No more mistakes with sizes!',
      subheadline:          '<strong>Join the Pilot</strong> – Enter your body dimensions,<br/>we will show you <strong>the right size on all the websites we work with</strong>',
      man:                  'Man',
      woman:                'Woman',
      boy:                  'Boy',
      girl:                 'Girl',
      height:               'HEIGHT',
      bust:                 'BUST',
      waist:                'WAIST',
      hips:                 'HIPS',
      emailPlaceholder:     'Your Email Address',
      profileNamePlaceholder: 'Profile name (your full name)',
      joinBtn:              'Join the Pilot',
      unitCm:               'CM',
      unitInch:             'INCH',
      weight:               'WEIGHT',
      age:                  'AGE',
      shapeInverted:        'Broad Shoulders',
      shapeRect:            'Rectangle',
      shapeTri:             'Pear Shape',
      sizeRegion:           'Which size system do you usually shop in?',
      fitQuestion:          'How do you prefer your fit?',
      fitSubtext:           'This helps us calculate the right amount of ease for your measurements.',
      tight:                'Tight',
      tightSub:             'Close to body',
      regular:              'Regular',
      regularSub:           'Standard fit',
      loose:                'Loose',
      looseSub:             'Relaxed & roomy',
      usualSizeQuestion:    'What size do you usually wear?',
      usualSizeSub:         'This helps us fine-tune your recommendations',
      continueBtn:          'Continue →',
      successTitle:         "You're all set!",
      successBody:          "SizeFitMe is now active. Visit any product page on AliExpress or SHEIN and we'll highlight your best size automatically.",
      startShopping:        'Start Shopping',
      supportedOn:          'Supported on:',
      errEmail:             'Please enter a valid email address.',
      errMeasure:           'Please set realistic measurements before continuing.',
    },
  };

  let lang = 'he';

  function t(key) {
    return TRANSLATIONS[lang][key] || key;
  }

  function applyLang(newLang) {
    lang = newLang;
    document.documentElement.lang = lang;
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    document.title = lang === 'he' ? 'SizeFitMe – הצטרפו לפיילוט' : 'SizeFitMe – Join the Pilot';

    document.getElementById('btnHe').classList.toggle('active', lang === 'he');
    document.getElementById('btnEn').classList.toggle('active', lang === 'en');
    document.getElementById('btnCm').textContent   = t('unitCm');
    document.getElementById('btnInch').textContent = t('unitInch');

    const cb = document.getElementById('btnConfirmFit');
    if (cb) cb.textContent = t('continueBtn');

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = TRANSLATIONS[lang][el.dataset.i18n];
      if (val !== undefined) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = TRANSLATIONS[lang][el.dataset.i18nHtml];
      if (val !== undefined) el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const val = TRANSLATIONS[lang][el.dataset.i18nPlaceholder];
      if (val !== undefined) el.placeholder = val;
    });
  }

  // ── STATE ──────────────────────────────────────────────────────────────────
  let unit           = 'cm';
  let gender         = 'man';
  let bodyShape      = 'rectangle';
  let selectedRegion = 'EU';

  // Per-gender default measurements (cm)
  const GENDER_DEFAULTS = {
    man:   { height: 176, bust: 100, waist: 85, hips: 98,  weight: 80 },
    woman: { height: 164, bust: 90,  waist: 70, hips: 97,  weight: 62 },
    boy:   { height: 130, bust: 65,  waist: 58, hips: 68,  weight: 35 },
    girl:  { height: 128, bust: 63,  waist: 56, hips: 66,  weight: 33 },
  };

  // Size chips per region — EU is default (most common in Israel)
  const REGION_SIZES = {
    EU: ['XS','S','M','L','XL','2XL','3XL','4XL'],
    US: ['XS','S','M','L','XL','2XL','3XL'],
    UK: ['6','8','10','12','14','16','18','20'],
    CN: ['S','M','L','XL','2XL','3XL','4XL','5XL'],
  };

  const KG_TO_LB = 2.20462;
  const WEIGHT_KG = { min: 20, max: 200 };
  const WEIGHT_LB = { min: 44, max: 440 };

  const SLIDERS_CM = {
    height: { min: 80,  max: 220 },
    bust:   { min: 40,  max: 150 },
    waist:  { min: 30,  max: 140 },
    hips:   { min: 40,  max: 160 },
  };

  const CM_TO_INCH = 1 / 2.54;
  function cmToInch(v) { return Math.round(v * CM_TO_INCH * 10) / 10; }
  function inchToCm(v) { return Math.round(v * 2.54 * 10) / 10; }

  // ── DOM REFS ───────────────────────────────────────────────────────────────
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');

  const btnCm   = document.getElementById('btnCm');
  const btnInch = document.getElementById('btnInch');

  const sliders = {
    height: document.getElementById('sliderHeight'),
    bust:   document.getElementById('sliderBust'),
    waist:  document.getElementById('sliderWaist'),
    hips:   document.getElementById('sliderHips'),
  };
  const inputs = {
    height: document.getElementById('inputHeight'),
    bust:   document.getElementById('inputBust'),
    waist:  document.getElementById('inputWaist'),
    hips:   document.getElementById('inputHips'),
  };
  const sliderWeight = document.getElementById('sliderWeight');
  const inputWeight  = document.getElementById('inputWeight');
  const weightUnitLabel = document.getElementById('weightUnitLabel');
  const sliderAge    = document.getElementById('sliderAge');
  const inputAge     = document.getElementById('inputAge');

  const emailInput  = document.getElementById('inputEmail');
  const nameInput   = document.getElementById('inputProfileName');
  const btnJoin     = document.getElementById('btnJoinPilot');
  const errorMsg    = document.getElementById('errorMsg');
  const fitBtns     = document.querySelectorAll('.fit-btn');
  const confirmBtn  = document.getElementById('btnConfirmFit');
  const usualSizeSection = document.getElementById('usualSizeSection');
  const sizeTilesContainer = document.getElementById('sizeTilesContainer');

  // ── URL mode flags ─────────────────────────────────────────────────────────
  const urlParams    = new URLSearchParams(location.search);
  const isAddProfile  = urlParams.get('mode') === 'addProfile';
  const isEditProfile = urlParams.get('mode') === 'editProfile';
  const editProfileId = urlParams.get('profileId') || null;

  if (isAddProfile || isEditProfile) {
    document.getElementById('profileNameRow')?.classList.remove('hidden');
  }

  // Pre-fill existing profile when editing
  if (isEditProfile && editProfileId) {
    chrome.storage.local.get('profiles', (data) => {
      const profiles = data.profiles || [];
      const existing = profiles.find(p => p.id === editProfileId);
      if (!existing) return;

      // Change UI to edit mode
      document.title = 'SizeFitMe – Edit Profile';
      const headlineEl = document.querySelector('.headline');
      if (headlineEl) headlineEl.textContent = lang === 'he' ? 'עריכת מידות' : 'Edit Measurements';
      const subheadlineEl = document.querySelector('.subheadline');
      if (subheadlineEl) subheadlineEl.textContent = '';
      if (btnJoin) {
        btnJoin.textContent  = lang === 'he' ? 'שמור שינויים' : 'Save Changes';
        btnJoin.dataset.editMode = 'true';
      }

      // Pre-fill name
      if (nameInput) nameInput.value = existing.name || '';

      // Pre-fill gender
      setGender(existing.gender || 'man');

      // Pre-fill unit
      const existingUnit = existing.unit || 'cm';
      applyUnit(existingUnit);

      // Pre-fill measurements
      const cm  = existing.measurementsCm || {};
      const raw = existing.measurementsRaw || {};
      ['height','bust','waist','hips'].forEach(k => {
        const val = existingUnit === 'cm'
          ? (cm[k] || raw[k] || 0)
          : cmToInch(cm[k] || 0);
        if (sliders[k]) { sliders[k].value = val; inputs[k].value = val; }
      });

      // Pre-fill weight
      if (sliderWeight && existing.weight) {
        const wVal = existingUnit === 'inch' ? Math.round(existing.weight * KG_TO_LB) : existing.weight;
        sliderWeight.value = wVal;
        inputWeight.value  = wVal;
      }

      // Pre-fill body shape
      if (existing.bodyShape) setBodyShape(existing.bodyShape);

      // Pre-fill age
      if (existing.age && sliderAge) {
        sliderAge.value = existing.age;
        inputAge.value  = existing.age;
      }

      // Store original id so SAVE_PROFILE updates instead of creating new
      window._editingProfileId        = editProfileId;
      window._editingProfileCreatedAt = existing.createdAt;

      // Pre-select fit + region + usual size on step 2
      window._editingFit       = existing.fitPreference || null;
      window._editingUsualSize = existing.usualSize     || null;
      window._editingRegion    = existing.sizeRegion    || 'EU';
    });
  }

  // ── UNIT TOGGLE ────────────────────────────────────────────────────────────
  function applyUnit(newUnit) {
    const prev = unit;
    unit = newUnit;

    btnCm.classList.toggle('active',   unit === 'cm');
    btnInch.classList.toggle('active', unit === 'inch');

    Object.keys(SLIDERS_CM).forEach(key => {
      const cfg    = SLIDERS_CM[key];
      const slider = sliders[key];
      const input  = inputs[key];
      const curCm  = prev === 'cm'
        ? parseFloat(slider.value)
        : inchToCm(parseFloat(slider.value));

      if (unit === 'cm') {
        slider.min = cfg.min; slider.max = cfg.max; slider.step = 1;
        input.min  = cfg.min; input.max  = cfg.max; input.step  = 1;
        const val  = Math.round(curCm);
        slider.value = val; input.value = val;
      } else {
        const minI = Math.round(cfg.min * CM_TO_INCH * 10) / 10;
        const maxI = Math.round(cfg.max * CM_TO_INCH * 10) / 10;
        const valI = Math.round(curCm   * CM_TO_INCH * 10) / 10;
        slider.min = minI; slider.max = maxI; slider.step = 0.1;
        input.min  = minI; input.max  = maxI; input.step  = 0.1;
        slider.value = valI; input.value = valI;
      }
    });
  }

  function applyWeightUnit(newUnit) {
    const curKg = unit === 'inch'
      ? parseFloat(sliderWeight.value) / KG_TO_LB
      : parseFloat(sliderWeight.value);

    if (newUnit === 'inch') {
      const lb = Math.round(curKg * KG_TO_LB);
      sliderWeight.min = WEIGHT_LB.min; sliderWeight.max = WEIGHT_LB.max;
      inputWeight.min  = WEIGHT_LB.min; inputWeight.max  = WEIGHT_LB.max;
      sliderWeight.value = lb; inputWeight.value = lb;
      if (weightUnitLabel) weightUnitLabel.textContent = 'lbs';
    } else {
      const kg = Math.round(curKg);
      sliderWeight.min = WEIGHT_KG.min; sliderWeight.max = WEIGHT_KG.max;
      inputWeight.min  = WEIGHT_KG.min; inputWeight.max  = WEIGHT_KG.max;
      sliderWeight.value = kg; inputWeight.value = kg;
      if (weightUnitLabel) weightUnitLabel.textContent = lang === 'he' ? 'ק"ג' : 'kg';
    }
  }

  btnCm.addEventListener('click',   () => { applyUnit('cm');   applyWeightUnit('cm');   });
  btnInch.addEventListener('click', () => { applyUnit('inch'); applyWeightUnit('inch'); });

  // ── LANGUAGE TOGGLE ────────────────────────────────────────────────────────
  document.getElementById('btnHe').addEventListener('click', () => applyLang('he'));
  document.getElementById('btnEn').addEventListener('click', () => applyLang('en'));

  // ── GENDER GRID ────────────────────────────────────────────────────────────
  function setGender(g) {
    gender = g;
    document.querySelectorAll('.gender-card').forEach(card => {
      card.classList.toggle('active', card.dataset.gender === g);
    });
    // Sync toggle switch position (man = unchecked, woman = checked)
    const sw = document.getElementById('genderSwitchInput');
    if (sw) sw.checked = (g === 'woman');
    // Focus the matching person photo
    const leftCol  = document.querySelector('.person-left');
    const rightCol = document.querySelector('.person-right');
    if (leftCol && rightCol) {
      leftCol.classList.toggle('active',  g === 'man'   || g === 'boy');
      rightCol.classList.toggle('active', g === 'woman' || g === 'girl');
    }
    // Apply defaults for this gender
    const def = GENDER_DEFAULTS[g];
    if (def) {
      Object.keys(def).forEach(key => {
        if (sliders[key]) {
          const val = unit === 'cm' ? def[key] : cmToInch(def[key]);
          sliders[key].value = val;
          inputs[key].value  = val;
        }
      });
      if (sliderWeight && def.weight) {
        const wVal = unit === 'inch' ? Math.round(def.weight * KG_TO_LB) : def.weight;
        sliderWeight.value = wVal;
        inputWeight.value  = wVal;
      }
    }
  }

  document.querySelectorAll('.gender-card').forEach(card => {
    card.addEventListener('click', () => setGender(card.dataset.gender));
  });

  // ── BODY SHAPE ──────────────────────────────────────────────────────────────
  function setBodyShape(s) {
    bodyShape = s;
    document.querySelectorAll('.body-shape-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.shape === s);
    });
  }
  document.querySelectorAll('.body-shape-btn').forEach(btn => {
    btn.addEventListener('click', () => setBodyShape(btn.dataset.shape));
  });

  // Toggle switch (MAN ←→ WOMAN)
  const genderSwitchInput = document.getElementById('genderSwitchInput');
  if (genderSwitchInput) {
    genderSwitchInput.addEventListener('change', () => {
      setGender(genderSwitchInput.checked ? 'woman' : 'man');
    });
  }

  // ── REGION / SIZE SYSTEM ──────────────────────────────────────────────────
  function setRegion(r, preselectedSize) {
    selectedRegion = r;
    document.querySelectorAll('.region-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.region === r);
    });
    if (!sizeTilesContainer) return;
    sizeTilesContainer.innerHTML = (REGION_SIZES[r] || REGION_SIZES.EU).map(s =>
      `<button class="size-tile${preselectedSize === s ? ' selected' : ''}" data-size="${s}">${s}</button>`
    ).join('');
    // Wire click listeners on fresh tiles
    sizeTilesContainer.querySelectorAll('.size-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        sizeTilesContainer.querySelectorAll('.size-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        selectedUsualSize = tile.dataset.size;
      });
    });
  }

  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedUsualSize = null; // reset size chip when changing region
      setRegion(btn.dataset.region, null);
    });
  });

  // ── SLIDER ↔ INPUT SYNC ───────────────────────────────────────────────────
  Object.keys(sliders).forEach(key => {
    sliders[key].addEventListener('input', () => { inputs[key].value = sliders[key].value; });
    inputs[key].addEventListener('input', () => {
      const val = parseFloat(inputs[key].value);
      if (!isNaN(val)) {
        sliders[key].value = Math.min(Math.max(val, parseFloat(sliders[key].min)), parseFloat(sliders[key].max));
      }
    });
  });

  if (sliderWeight) {
    sliderWeight.addEventListener('input', () => { inputWeight.value = sliderWeight.value; });
    inputWeight.addEventListener('input', () => {
      const v = parseFloat(inputWeight.value);
      if (!isNaN(v)) sliderWeight.value = Math.min(Math.max(v, parseFloat(sliderWeight.min)), parseFloat(sliderWeight.max));
    });
  }

  if (sliderAge) {
    sliderAge.addEventListener('input', () => { inputAge.value = sliderAge.value; });
    inputAge.addEventListener('input', () => {
      const v = parseInt(inputAge.value);
      if (!isNaN(v)) sliderAge.value = Math.min(Math.max(v, parseInt(sliderAge.min)), parseInt(sliderAge.max));
    });
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function getMeasurementsCm() {
    const raw = {};
    Object.keys(inputs).forEach(k => { raw[k] = parseFloat(inputs[k].value) || 0; });
    if (unit === 'inch') {
      return {
        height: inchToCm(raw.height),
        bust:   inchToCm(raw.bust),
        waist:  inchToCm(raw.waist),
        hips:   inchToCm(raw.hips),
      };
    }
    return raw;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ── STEP 1 SUBMIT ──────────────────────────────────────────────────────────
  btnJoin.addEventListener('click', () => {
    errorMsg.textContent = '';

    // Email required only on first registration
    if (!isEditProfile) {
      const email = emailInput.value.trim();
      if (!validateEmail(email)) {
        errorMsg.textContent = t('errEmail');
        emailInput.focus();
        return;
      }
    }

    const measurements = getMeasurementsCm();
    if (measurements.bust < 40 || measurements.waist < 30 || measurements.hips < 40) {
      errorMsg.textContent = t('errMeasure');
      return;
    }

    window._partialProfile = {
      id:     window._editingProfileId || `prof_${Date.now()}`,
      name:   (isAddProfile || isEditProfile) ? (nameInput?.value.trim() || '') : 'My Profile',
      gender,
      unit,
      email:  emailInput.value.trim() || null,
      measurementsCm: measurements,
      measurementsRaw: {
        height: parseFloat(inputs.height.value),
        bust:   parseFloat(inputs.bust.value),
        waist:  parseFloat(inputs.waist.value),
        hips:   parseFloat(inputs.hips.value),
      },
      createdAt: window._editingProfileCreatedAt || Date.now(),
      weight: unit === 'inch'
        ? Math.round(parseFloat(inputWeight?.value || 0) / KG_TO_LB)
        : parseFloat(inputWeight?.value || 0),
      bodyShape,
      age: parseInt(inputAge?.value || 0) || null,
      sizeRegion: selectedRegion,
    };

    // Pre-select fit/size from existing profile
    if (window._editingFit) {
      fitBtns.forEach(b => {
        b.classList.toggle('selected', b.dataset.fit === window._editingFit);
      });
      selectedFit = window._editingFit;
      usualSizeSection.classList.remove('hidden');
      confirmBtn.classList.add('visible');
      confirmBtn.removeAttribute('disabled');
    }
    setRegion(window._editingRegion || 'EU', window._editingUsualSize || null);
    if (window._editingUsualSize) selectedUsualSize = window._editingUsualSize;

    step1.classList.remove('active');
    step2.classList.add('active');
  });

  // ── STEP 2: FIT PREFERENCE + USUAL SIZE ───────────────────────────────────
  let selectedFit       = null;
  let selectedUsualSize = null;

  fitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      fitBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFit = btn.dataset.fit;
      usualSizeSection.classList.remove('hidden');
      confirmBtn.classList.add('visible');
      confirmBtn.removeAttribute('disabled');
    });
  });

  confirmBtn.addEventListener('click', () => {
    if (!selectedFit) return;

    const base = window._partialProfile || {
      id:   window._editingProfileId || `prof_${Date.now()}`,
      name: 'My Profile',
      gender, unit, sizeRegion: selectedRegion,
      measurementsCm: getMeasurementsCm(),
      measurementsRaw: {
        height: parseFloat(inputs.height.value),
        bust:   parseFloat(inputs.bust.value),
        waist:  parseFloat(inputs.waist.value),
        hips:   parseFloat(inputs.hips.value),
      },
      createdAt: window._editingProfileCreatedAt || Date.now(),
    };

    const profile = {
      ...base,
      fitPreference:       selectedFit,
      usualSize:           selectedUsualSize || null,
      sizeRegion:          selectedRegion,
      onboardingCompleted: true,
      savedAt:             Date.now(),
    };

    // Use SAVE_PROFILE message so background.js handles profiles array properly
    chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', data: profile }, () => {
      if (isEditProfile) {
        window.close(); // Just close — no need for success screen
      } else {
        step2.classList.remove('active');
        step3.classList.add('active');
      }
    });
  });

  // ── PERSON PHOTO CLICKS (switch gender) ────────────────────────────────────
  const personLeftPhoto  = document.querySelector('.person-left  .person-photo');
  const personRightPhoto = document.querySelector('.person-right .person-photo');
  if (personLeftPhoto)  personLeftPhoto.addEventListener('click',  () => setGender('man'));
  if (personRightPhoto) personRightPhoto.addEventListener('click', () => setGender('woman'));

  // ── STEP 3 ─────────────────────────────────────────────────────────────────
  document.getElementById('btnStartShopping').addEventListener('click', () => window.close());

  // ── INIT ───────────────────────────────────────────────────────────────────
  applyLang('he');
  setGender('man');
  setRegion('EU');
})();
