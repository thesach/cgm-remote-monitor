'use strict';

var _ = require('lodash');
var units = require('../units')();
var times = require('../times');

var COMMON_FOODS = [
  { name: 'pizza slice', keywords: ['pizza'], carbs: 30, protein: 12, fat: 10, portions: 1 },
  { name: 'sandwich', keywords: ['sandwich', 'sub', 'panini'], carbs: 35, protein: 18, fat: 10, portions: 1 },
  { name: 'burger', keywords: ['burger'], carbs: 30, protein: 20, fat: 15, portions: 1 },
  { name: 'taco', keywords: ['taco'], carbs: 20, protein: 12, fat: 8, portions: 1 },
  { name: 'pasta', keywords: ['pasta', 'spaghetti', 'noodles'], carbs: 45, protein: 12, fat: 6, portions: 1 },
  { name: 'rice bowl', keywords: ['rice', 'bowl'], carbs: 50, protein: 12, fat: 5, portions: 1 },
  { name: 'salad', keywords: ['salad'], carbs: 12, protein: 6, fat: 8, portions: 1 },
  { name: 'apple', keywords: ['apple'], carbs: 25, protein: 0, fat: 0, portions: 1 },
  { name: 'banana', keywords: ['banana'], carbs: 27, protein: 1, fat: 0, portions: 1 }
];

function init () {
  // for the tests window isn't the global object
  var $ = window.$;
  var Nightscout = window.Nightscout;
  var client = Nightscout.client;
  var iob = client.plugins('iob');
  var cob = client.plugins('cob');
  var translate;

  var state = {
    foods: [],
    quickpicks: [],
    lastIob: 0,
    lastCob: 0,
    lastBasal: 0,
    lastBg: 0,
    lastDelta: null,
    bgLockedToCurrent: true,
    photoFile: null,
    latestProfile: null,
    isStale: false
  };

  client.init(function loaded () {
    translate = client.translate;
    setupUi();
    loadFoodData();
    refreshFromClient();
    hookClientUpdates();
  });

  function setupUi () {
    setUnitsLabels();

    $('#mb_meal_description').on('input', function mealDescriptionInput () {
      var text = $('#mb_meal_description').val();
      renderMatches(findMatches(text));
      updateSuggestion();
    });
    $('#mb_carbs, #mb_protein, #mb_fat, #mb_portions').on('input', updateSuggestion);
    $('#mb_use_iob, #mb_use_cob, #mb_use_trend, #mb_trend_horizon').on('change', updateSuggestion);
    $('#mb_bg_input').on('input', function bgInputChange () {
      state.bgLockedToCurrent = false;
      updateSuggestion();
    });
    $('#mb_use_current_bg').on('click', function useCurrentBg (event) {
      state.bgLockedToCurrent = true;
      setBgInputFromCurrent();
      updateSuggestion();
      maybePrevent(event);
    });

    $('#mb_estimate_text').on('click', function estimateText (event) {
      estimateFromText($('#mb_meal_description').val());
      maybePrevent(event);
    });
    $('#mb_clear_meal').on('click', function clearMeal (event) {
      clearMealInputs();
      updateSuggestion();
      maybePrevent(event);
    });
    $('#mb_add_quickpick').on('click', function addQuickpick (event) {
      applyQuickpick();
      maybePrevent(event);
    });

    $('#mb_meal_photo').on('change', handlePhotoSelected);
    $('#mb_analyze_photo').on('click', function analyzePhoto (event) {
      estimateFromPhoto();
      maybePrevent(event);
    });

    $('#mb_copy_summary').on('click', function copySummary (event) {
      copySummaryToClipboard();
      maybePrevent(event);
    });
    $('#mb_reset_suggestion').on('click', function resetSuggestion (event) {
      resetSuggestionInputs();
      updateSuggestion();
      maybePrevent(event);
    });
  }

  function setUnitsLabels () {
    var unitsLabel = client.settings.units === 'mmol' ? 'mmol/L' : 'mg/dL';
    $('#mb_bg_units').text(unitsLabel);
    $('#mb_bg_input_units').text(unitsLabel);
    $('#mb_bg_input').attr('step', client.settings.units === 'mmol' ? '0.1' : '1');
  }

  function loadFoodData () {
    var headers = client.headers();
    $('#mb_quickpick').empty().append('<option value="">' + translate('(none)') + '</option>');

    $.ajax('/api/v1/food/quickpicks.json', { headers: headers })
      .done(function quickpickLoaded (records) {
        state.quickpicks = records || [];
        renderQuickpicks();
      })
      .fail(function quickpickFailed () {
        state.quickpicks = [];
        renderQuickpicks();
      });

    $.ajax('/api/v1/food/regular.json', { headers: headers })
      .done(function foodLoaded (records) {
        state.foods = records || [];
      })
      .fail(function foodFailed () {
        state.foods = [];
      });
  }

  function renderQuickpicks () {
    var select = $('#mb_quickpick');
    select.empty().append('<option value="">' + translate('(none)') + '</option>');
    state.quickpicks.forEach(function eachPick (pick, index) {
      var carbs = pick.carbs ? Math.round(pick.carbs) : 0;
      select.append('<option value="' + index + '">' + pick.name + ' (' + carbs + ' g)</option>');
    });
  }

  function refreshFromClient () {
    updateGlucose();
    updateProfile();
    updateIobCob();
    updateSuggestion();
  }

  function hookClientUpdates () {
    if (!client.socket) {
      return;
    }
    client.socket.on('dataUpdate', function onDataUpdate () {
      refreshFromClient();
    });
  }

  function updateGlucose () {
    var latest = client.latestSGV;
    var now = (client.nowSBX && client.nowSBX.time) || Date.now();
    var bgValue = latest && latest.mgdl ? latest.mgdl : 0;
    var delta = client.nowSBX && client.nowSBX.properties ? client.nowSBX.properties.delta : null;

    state.lastBg = bgValue;
    state.lastDelta = delta ? delta.mgdl : null;
    state.isStale = !latest || (now - latest.mills > times.mins(10).msecs);

    $('#mb_current_bg').text(bgValue ? formatBgForDisplay(bgValue) : '--');
    $('#mb_delta_value').text(delta ? delta.display : '--');
    $('#mb_trend_label').text(resolveTrendLabel(latest));
    $('#mb_last_update').text(formatLastUpdate(latest, now));

    $('#mb_status_badge').text(state.isStale ? translate('Stale') : translate('Current'));
    $('#mb_status_badge').toggleClass('mb-stale', state.isStale);

    if (state.bgLockedToCurrent) {
      setBgInputFromCurrent();
    }

    $('#centerMessagePanel').hide();
  }

  function updateProfile () {
    if (!client.nowSBX || !client.nowSBX.data || !client.nowSBX.data.profile) {
      state.latestProfile = null;
      return;
    }

    var profileName = client.profilefunctions.activeProfileToTime();
    var eventTime = new Date();
    var profile = client.nowSBX.data.profile;

    var targetLow = profile.getLowBGTarget(eventTime, profileName) || 0;
    var targetHigh = profile.getHighBGTarget(eventTime, profileName) || 0;
    var ic = profile.getCarbRatio(eventTime, profileName) || 0;
    var isf = profile.getSensitivity(eventTime, profileName) || 0;

    state.latestProfile = {
      name: profileName,
      targetLow: targetLow,
      targetHigh: targetHigh,
      ic: ic,
      isf: isf
    };

    $('#mb_profile_name').text(profileName || '--');
    $('#mb_target_range').text(formatBgForDisplay(targetLow) + ' - ' + formatBgForDisplay(targetHigh) + ' ' + currentUnitsLabel());
    $('#mb_ic_value').text(ic ? ic.toFixed(1) + ' g/U' : '--');
    $('#mb_isf_value').text(isf ? formatBgForDisplay(isf) + ' ' + currentUnitsLabel() + '/U' : '--');
  }

  function updateIobCob () {
    var profileName = client.profilefunctions.activeProfileToTime();
    var eventTime = new Date();
    var profile = client.nowSBX && client.nowSBX.data ? client.nowSBX.data.profile : null;
    var treatments = client.ddata ? client.ddata.treatments : [];
    var devicestatus = client.ddata ? client.ddata.devicestatus : [];

    var iobTotal = 0;
    var cobTotal = 0;
    var basalRate = 0;

    if (profile) {
      iobTotal = iob.calcTotal(treatments, devicestatus, profile, eventTime, profileName).iob || 0;
      cobTotal = cob.cobTotal(treatments, devicestatus, profile, eventTime, profileName).cob || 0;
      var basal = profile.getTempBasal(eventTime, profileName);
      basalRate = basal && basal.totalbasal ? basal.totalbasal : 0;
    }

    state.lastIob = iobTotal;
    state.lastCob = cobTotal;
    state.lastBasal = basalRate;

    $('#mb_iob_value').text(formatNumber(iobTotal) + ' U');
    $('#mb_cob_value').text(formatNumber(cobTotal) + ' g');
    $('#mb_basal_value').text(basalRate ? basalRate.toFixed(3) + ' U/hr' : '--');
  }

  function updateSuggestion () {
    if (!state.latestProfile || !state.latestProfile.ic || !state.latestProfile.isf) {
      setSuggestionNote(translate('Profile settings not available yet.'));
      setSuggestionOutputs(emptySuggestion());
      return;
    }

    var meal = readMealInputs();
    var bgValue = readBgInput();
    var trendHorizon = parseInt($('#mb_trend_horizon').val(), 10) || 30;
    var useIob = $('#mb_use_iob').is(':checked');
    var useCob = $('#mb_use_cob').is(':checked');
    var useTrend = $('#mb_use_trend').is(':checked');

    var result = calculateBolus({
      carbs: meal.carbs,
      bg: bgValue,
      ic: state.latestProfile.ic,
      isf: state.latestProfile.isf,
      targetLow: state.latestProfile.targetLow,
      targetHigh: state.latestProfile.targetHigh,
      iob: state.lastIob,
      cob: state.lastCob,
      trendDelta: state.lastDelta,
      trendHorizon: trendHorizon,
      useIob: useIob,
      useCob: useCob,
      useTrend: useTrend
    });

    setSuggestionOutputs(result);
    setSuggestionNote(buildSuggestionNote(result, meal, bgValue, useTrend));
  }

  function calculateBolus (input) {
    var carbBolus = input.ic ? (input.carbs / input.ic) : 0;
    var bgCorrection = 0;
    if (input.bg > 0) {
      if (input.bg > input.targetHigh) {
        bgCorrection = (input.bg - input.targetHigh) / input.isf;
      } else if (input.bg < input.targetLow) {
        bgCorrection = (input.bg - input.targetLow) / input.isf;
      }
    }

    var iobAdj = input.useIob ? -input.iob : 0;
    var cobAdj = input.useCob ? (input.cob / input.ic) : 0;
    var trendAdj = 0;
    if (input.useTrend && input.trendDelta !== null && input.trendDelta !== undefined) {
      var projectedDelta = input.trendDelta * (input.trendHorizon / 5);
      trendAdj = projectedDelta / input.isf;
    }

    var total = carbBolus + bgCorrection + iobAdj + cobAdj + trendAdj;
    var rounded = roundTo(total, 0.05);
    var rounding = rounded - total;
    var carbsNeeded = 0;
    if (rounded < 0) {
      carbsNeeded = Math.ceil(-total * input.ic);
    }

    return {
      carbBolus: carbBolus,
      bgCorrection: bgCorrection,
      iobAdj: iobAdj,
      cobAdj: cobAdj,
      trendAdj: trendAdj,
      total: total,
      rounded: rounded,
      rounding: rounding,
      carbsNeeded: carbsNeeded
    };
  }

  function setSuggestionOutputs (result) {
    var rounded = result.rounded < 0 ? 0 : result.rounded;
    $('#mb_total_insulin').text(formatNumber(rounded));
    $('#mb_carb_bolus').text(formatNumber(result.carbBolus));
    $('#mb_bg_correction').text(formatSigned(result.bgCorrection));
    $('#mb_trend_adjustment').text(formatSigned(result.trendAdj));
    $('#mb_iob_adjustment').text(formatSigned(result.iobAdj));
    $('#mb_cob_adjustment').text(formatSigned(result.cobAdj));
    $('#mb_rounding').text(formatSigned(result.rounding));
  }

  function buildSuggestionNote (result, meal, bgValue, useTrend) {
    var notes = [];

    if (state.isStale) {
      notes.push(translate('Glucose data is older than 10 minutes.'));
    }

    if (!bgValue) {
      notes.push(translate('No glucose value selected for correction.'));
    }

    if (!useTrend) {
      notes.push(translate('Trend adjustment is disabled.'));
    }

    if (meal.carbs === 0) {
      notes.push(translate('No carbs entered. Add carbs or use quick picks to estimate.'));
    }

    if (result.carbsNeeded > 0) {
      notes.push(translate('No bolus suggested. Consider %1 g carbs to cover current insulin.', { params: [result.carbsNeeded] }));
    } else {
      notes.push(translate('Suggestion uses IC %1 and ISF %2.', {
        params: [formatNumber(state.latestProfile.ic), formatBgForDisplay(state.latestProfile.isf)]
      }));
    }

    return notes.join(' ');
  }

  function setSuggestionNote (text) {
    $('#mb_suggestion_note').text(text || '');
  }

  function readMealInputs () {
    var portions = parseFloat($('#mb_portions').val().replace(',', '.'));
    portions = isNaN(portions) || portions <= 0 ? 1 : portions;

    var carbs = parseFloat($('#mb_carbs').val().replace(',', '.'));
    var protein = parseFloat($('#mb_protein').val().replace(',', '.'));
    var fat = parseFloat($('#mb_fat').val().replace(',', '.'));

    carbs = isNaN(carbs) ? 0 : carbs;
    protein = isNaN(protein) ? 0 : protein;
    fat = isNaN(fat) ? 0 : fat;

    return {
      carbs: carbs * portions,
      protein: protein * portions,
      fat: fat * portions,
      portions: portions
    };
  }

  function readBgInput () {
    var raw = parseFloat($('#mb_bg_input').val().replace(',', '.'));
    if (isNaN(raw) || raw <= 0) {
      return 0;
    }
    return client.settings.units === 'mmol' ? units.mmolToMgdl(raw) : raw;
  }

  function formatBgForDisplay (mgdl) {
    if (!mgdl) {
      return '--';
    }
    var scaled = client.utils.scaleMgdl(mgdl);
    return client.utils.roundBGForDisplay(scaled);
  }

  function formatLastUpdate (entry, now) {
    if (!entry) {
      return '--';
    }
    var ago = client.timeago.calcDisplay(entry, now);
    if (!ago || !ago.value) {
      return '--';
    }
    return ago.value + ' ' + translate(ago.label);
  }

  function resolveTrendLabel (entry) {
    if (!entry) {
      return '--';
    }
    var dir = entry.direction || '';
    var map = {
      NONE: 'flat',
      Flat: 'flat',
      SingleUp: 'rising',
      DoubleUp: 'rising fast',
      TripleUp: 'rising fast',
      FortyFiveUp: 'rising',
      SingleDown: 'falling',
      DoubleDown: 'falling fast',
      TripleDown: 'falling fast',
      FortyFiveDown: 'falling',
      'NOT COMPUTABLE': 'unknown',
      'RATE OUT OF RANGE': 'rapid change'
    };
    return translate(map[dir] || 'unknown');
  }

  function setBgInputFromCurrent () {
    if (!state.lastBg) {
      return;
    }
    var display = formatBgForDisplay(state.lastBg);
    $('#mb_bg_input').val(display);
  }

  function findMatches (text) {
    if (!text) {
      return [];
    }
    var normalized = normalizeText(text);
    var matches = [];

    COMMON_FOODS.forEach(function eachCommon (food) {
      var hit = food.keywords.some(function (keyword) {
        return normalized.indexOf(keyword) > -1;
      });
      if (hit) {
        matches.push(buildMatch(food.name, food.carbs, food.protein, food.fat, food.portions, 'common', food.name.length + 10));
      }
    });

    state.foods.forEach(function eachFood (food) {
      var name = (food.name || '').toLowerCase();
      if (!name || normalized.indexOf(name) === -1) {
        return;
      }
      matches.push(buildMatch(food.name, food.carbs, food.protein, food.fat, 1, 'database', name.length + 20));
    });

    matches = matches.sort(function sortMatches (a, b) {
      return b.score - a.score;
    });

    return _.uniqBy(matches, 'name');
  }

  function buildMatch (name, carbs, protein, fat, portions, source, score) {
    return {
      name: name,
      carbs: carbs || 0,
      protein: protein || 0,
      fat: fat || 0,
      portions: portions || 1,
      source: source,
      score: score || 0
    };
  }

  function renderMatches (matches) {
    var list = $('#mb_match_results');
    list.empty();
    if (!matches.length) {
      list.append('<div class="mb-hint">' + translate('Type a meal description to see matches.') + '</div>');
      return;
    }
    matches.slice(0, 6).forEach(function eachMatch (match) {
      var button = $('<button type="button" class="mb-suggestion-item"></button>');
      button.text(match.name + ' - ' + Math.round(match.carbs) + ' g carbs');
      button.on('click', function applyMatch () {
        applyEstimate(match, match.source);
      });
      list.append(button);
    });
  }

  function applyEstimate (match, source) {
    $('#mb_portions').val(match.portions || 1);
    $('#mb_carbs').val(roundTo(match.carbs || 0, 1));
    $('#mb_protein').val(roundTo(match.protein || 0, 1));
    $('#mb_fat').val(roundTo(match.fat || 0, 1));
    updateSuggestion();
    if (source) {
      setSuggestionNote(translate('Applied estimate from %1.', { params: [source] }));
    }
  }

  function estimateFromText (text) {
    var matches = findMatches(text);
    renderMatches(matches);
    if (matches.length) {
      applyEstimate(matches[0], matches[0].source);
    } else {
      setSuggestionNote(translate('No matches found. Use manual entry or quick picks.'));
    }
  }

  function handlePhotoSelected (event) {
    var files = event.target.files || [];
    if (!files.length) {
      state.photoFile = null;
      $('#mb_photo_preview').hide();
      return;
    }
    state.photoFile = files[0];
    var reader = new FileReader();
    reader.onload = function onLoad (loadEvent) {
      $('#mb_photo_preview').attr('src', loadEvent.target.result).show();
      $('#mb_photo_status').text(translate('Photo ready. Tap Analyze to estimate.'));
    };
    reader.readAsDataURL(state.photoFile);
  }

  function estimateFromPhoto () {
    if (!state.photoFile) {
      setSuggestionNote(translate('Add a photo first to analyze.'));
      return;
    }
    var hint = state.photoFile.name ? state.photoFile.name.replace(/[_-]/g, ' ') : '';
    var text = ($('#mb_meal_description').val() || '') + ' ' + hint;
    estimateFromText(text.trim());
  }

  function applyQuickpick () {
    var selected = $('#mb_quickpick').val();
    if (selected === '' || selected === null) {
      return;
    }
    var pick = state.quickpicks[parseInt(selected, 10)];
    if (!pick || !pick.foods || !pick.foods.length) {
      return;
    }
    var totals = pick.foods.reduce(function totalFoods (acc, item) {
      var portions = item.portions || 1;
      acc.carbs += (item.carbs || 0) * portions;
      acc.protein += (item.protein || 0) * portions;
      acc.fat += (item.fat || 0) * portions;
      return acc;
    }, { carbs: 0, protein: 0, fat: 0 });

    applyEstimate({
      name: pick.name,
      carbs: totals.carbs,
      protein: totals.protein,
      fat: totals.fat,
      portions: 1
    }, 'quick pick');
  }

  function clearMealInputs () {
    $('#mb_meal_description').val('');
    $('#mb_portions').val('1');
    $('#mb_carbs').val('');
    $('#mb_protein').val('');
    $('#mb_fat').val('');
    renderMatches([]);
    setSuggestionNote('');
  }

  function resetSuggestionInputs () {
    $('#mb_use_iob').prop('checked', true);
    $('#mb_use_cob').prop('checked', false);
    $('#mb_use_trend').prop('checked', true);
    $('#mb_trend_horizon').val('30');
    state.bgLockedToCurrent = true;
    setBgInputFromCurrent();
  }

  function copySummaryToClipboard () {
    var meal = readMealInputs();
    var summary = [
      translate('Meal Bolus Summary'),
      translate('Carbs') + ': ' + Math.round(meal.carbs) + ' g',
      translate('Protein') + ': ' + Math.round(meal.protein) + ' g',
      translate('Fat') + ': ' + Math.round(meal.fat) + ' g',
      translate('Glucose') + ': ' + ($('#mb_bg_input').val() || '--') + ' ' + currentUnitsLabel(),
      translate('IOB') + ': ' + formatNumber(state.lastIob) + ' U',
      translate('COB') + ': ' + formatNumber(state.lastCob) + ' g',
      translate('Suggested bolus') + ': ' + $('#mb_total_insulin').text() + ' U'
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(summary);
      setSuggestionNote(translate('Summary copied to clipboard.'));
    } else {
      window.prompt(translate('Copy summary below:'), summary);
    }
  }

  function normalizeText (text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  }

  function formatNumber (value) {
    if (!isFinite(value)) {
      return '0.00';
    }
    var fixed = value.toFixed(2);
    return fixed === '-0.00' ? '0.00' : fixed;
  }

  function formatSigned (value) {
    if (!isFinite(value) || value === 0) {
      return '0.00';
    }
    return (value > 0 ? '+' : '') + formatNumber(value);
  }

  function roundTo (x, step) {
    if (!x) {
      return 0;
    }
    return Math.round(x / step) * step;
  }

  function emptySuggestion () {
    return {
      carbBolus: 0,
      bgCorrection: 0,
      iobAdj: 0,
      cobAdj: 0,
      trendAdj: 0,
      total: 0,
      rounded: 0,
      rounding: 0,
      carbsNeeded: 0
    };
  }

  function currentUnitsLabel () {
    return client.settings.units === 'mmol' ? 'mmol/L' : 'mg/dL';
  }

  function maybePrevent (event) {
    if (event) {
      event.preventDefault();
    }
  }
}

module.exports = init;
