/* =========================================================
   feedback.js — වැරදි නිවැරදි කිරීම් සහ යෝජනා (card / modal)
   භාවිතය:
     • index.html හි  <script src="feedback.js" defer></script>
     • [data-feedback] ඇති ඕනෑම element එකක් click කළවිට card එක විවෘත වේ
       (වචනයක් සමඟ: data-feedback-word="ඉච්ඡති")
     • කේතයෙන්:  openFeedback('ඉච්ඡති')  /  closeFeedback()
   ========================================================= */
(function () {
  'use strict';

  // Code.gs Web App URL
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwcw4JImC4CxDf1pp9cWTr4xi4jMnWz_GwV3JG0GQAaf_xpBmiH9gKBFz2OPseSXBPhHg/exec';

  var CSS = '\
#fbOverlay{--mint-card:#FFFFFF;--mint-deep:#1E8F6C;--mint-mid:#34B88A;--mint-soft:#DCF4E8;--mint-line:#C7ECDA;--ink:#17332A;--ink-soft:#56736A;--fb-input:#F8FDFB;--fb-ph:#9FB7AE;\
position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;\
background:rgba(10,40,30,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);\
font-family:"Noto Sans Sinhala","Noto Sans",sans-serif;color:var(--ink);}\
#fbOverlay.show{display:flex;animation:fbFade .18s ease;}\
body.dark-theme #fbOverlay{--mint-card:#12241E;--mint-soft:#173A2E;--mint-line:#24473B;--ink:#E6F4EE;--ink-soft:#9DBDB1;--fb-input:#0E1D18;--fb-ph:#5F7F73;--mint-deep:#3FCB9D;--mint-mid:#2FA57E;background:rgba(0,0,0,.6);}\
@keyframes fbFade{from{opacity:0}to{opacity:1}}\
@keyframes fbPop{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}\
#fbCard{position:relative;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;overscroll-behavior:contain;\
background:var(--mint-card);border:1px solid var(--mint-line);border-radius:22px;padding:30px 24px 24px;\
box-shadow:0 30px 60px -20px rgba(10,60,45,.55);animation:fbPop .22s ease;}\
#fbCard::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,var(--mint-mid),var(--mint-deep));}\
#fbClose{position:absolute;top:12px;right:12px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid var(--mint-line);\
background:var(--mint-soft);color:var(--mint-deep);font-size:22px;line-height:1;cursor:pointer;box-shadow:none;display:flex;align-items:center;justify-content:center;}\
#fbCard .fb-eyebrow{display:flex;align-items:center;justify-content:center;gap:10px;margin:2px 0 6px;font-size:12.5px;font-weight:600;color:var(--mint-deep);}\
#fbCard .fb-eyebrow i{height:1px;width:24px;background:var(--mint-line);display:block;}\
#fbCard h2.fb-title{font-family:"Noto Serif Sinhala",serif;text-align:center;font-size:clamp(20px,5vw,25px);line-height:1.35;margin:4px 0 8px;color:var(--ink);font-weight:700;}\
#fbCard .fb-sub{text-align:center;color:var(--ink-soft);font-size:14px;line-height:1.6;margin:0 auto 18px;max-width:440px;}\
#fbCard .fb-sec{font-size:12.5px;font-weight:700;color:var(--mint-deep);margin:22px 0 4px;display:flex;align-items:center;gap:8px;}\
#fbCard .fb-sec:first-of-type{margin-top:4px;}\
#fbCard .fb-sec b{width:6px;height:6px;border-radius:50%;background:var(--mint-mid);flex:none;}\
#fbCard .fb-note{font-size:13px;color:var(--ink-soft);margin:0 0 8px;line-height:1.55;}\
#fbCard label{display:block;font-size:14px;font-weight:600;color:var(--ink);margin:14px 0 6px;}\
#fbCard label .req{color:#D9704F;margin-inline-start:3px;}\
#fbCard input,#fbCard textarea{width:100%;box-sizing:border-box;font-family:inherit;font-size:15px;color:var(--ink);background:var(--fb-input);\
border:1.5px solid var(--mint-line);border-radius:12px;padding:11px 13px;outline:none;transition:border-color .15s,box-shadow .15s;}\
#fbCard input.fb-pali{font-size:18px;font-weight:600;padding:12px 14px;}\
#fbCard textarea{resize:vertical;min-height:80px;line-height:1.55;}\
#fbCard ::placeholder{color:var(--fb-ph);font-weight:400;}\
#fbCard input:focus,#fbCard textarea:focus{border-color:var(--mint-mid);box-shadow:0 0 0 4px rgba(52,184,138,.16);}\
#fbCard hr{border:none;height:1px;margin:22px 0 0;background:repeating-linear-gradient(90deg,var(--mint-line) 0 6px,transparent 6px 12px);}\
#fbSubmit{width:100%;margin-top:24px;border:none;cursor:pointer;background:linear-gradient(180deg,var(--mint-mid),var(--mint-deep));color:#fff;\
font-family:inherit;font-weight:700;font-size:16px;padding:14px 18px;border-radius:13px;box-shadow:0 12px 24px -10px rgba(30,143,108,.55);}\
#fbSubmit:disabled{opacity:.7;cursor:default;}\
#fbCard .fb-hint{text-align:center;font-size:12.5px;color:var(--ink-soft);margin:12px 0 0;line-height:1.55;}\
#fbSuccess{display:none;text-align:center;padding:34px 8px 20px;}\
#fbCard.done #fbForm{display:none;}\
#fbCard.done #fbSuccess{display:block;}\
#fbSuccess .fb-check{width:58px;height:58px;border-radius:50%;background:var(--mint-soft);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}\
#fbSuccess h3{font-family:"Noto Serif Sinhala",serif;font-size:21px;margin:0 0 8px;color:var(--ink);}\
#fbSuccess p{color:var(--ink-soft);font-size:14.5px;line-height:1.6;margin:0 0 18px;}\
#fbSuccess button{font-family:inherit;cursor:pointer;background:none;color:var(--mint-deep);border:1.5px solid var(--mint-line);border-radius:13px;padding:10px 20px;font-size:14px;font-weight:600;margin:4px;}\
';

  var HTML = '\
<div id="fbCard" role="dialog" aria-modal="true" aria-labelledby="fbTitle">\
  <button type="button" id="fbClose" aria-label="වසන්න">&times;</button>\
  <div class="fb-eyebrow"><i></i><span>පාලි–සිංහල ශබ්දකෝෂය</span><i></i></div>\
  <h2 class="fb-title" id="fbTitle">වැරදි නිවැරදි කිරීම් සහ යෝජනා</h2>\
  <p class="fb-sub">ශබ්දකෝෂය කියවනවිට හමුවූ වැරදි, අඩුපාඩු, හෝ එකතු කළ යුතු වචන අප වෙත දන්වන්න.</p>\
  <form id="fbForm" novalidate>\
    <div class="fb-sec"><b></b>වැරැද්ද පිළිබඳ තොරතුරු</div>\
    <label for="fbPali">පාලි වචනය</label>\
    <input class="fb-pali" type="text" id="fbPali" placeholder="උදා: ඉච්ඡති" autocomplete="off">\
    <label for="fbErr">වැරැද්ද කුමක්දැයි පෙන්වන්න</label>\
    <textarea id="fbErr" placeholder="අර්ථය, ව්‍යාකරණය, අක්ෂර වින්‍යාසය ආදිය විස්තර කරන්න"></textarea>\
    <label for="fbFix">නිවැරදි කළ යුතු ආකාරය</label>\
    <textarea id="fbFix" placeholder="නිවැරදි අර්ථය හෝ ආකාරය ඉදිරිපත් කරන්න"></textarea>\
    <hr>\
    <div class="fb-sec"><b></b>අලුත් වචනයක් යෝජනා කිරීම</div>\
    <p class="fb-note">ශබ්දකෝෂයේ මෙතෙක් නොමැති වචනයක් දන්නවානම් මෙහි එකතු කරන්න.</p>\
    <input class="fb-pali" type="text" id="fbNew" placeholder="පාලි වචනය" autocomplete="off">\
    <hr>\
    <div class="fb-sec"><b></b>අමතර තොරතුරු</div>\
    <label for="fbCom">අදහස් සහ යෝජනා</label>\
    <textarea id="fbCom" placeholder="වෙනත් අදහසක් හෝ යෝජනාවක් තිබේනම් මෙහි ලියන්න"></textarea>\
    <label for="fbMail">ඔබේ ඊමේල් ලිපිනය</label>\
    <input type="email" id="fbMail" placeholder="you@example.com" autocomplete="email">\
    <button type="submit" id="fbSubmit">යොමු කරන්න</button>\
    <p class="fb-hint">ඉදිරිපත් කරන තොරතුරු ත්‍රිපිටක අටුවා ටීකා වලට ගැලපේ නම් ශබ්දකෝෂ සංශෝධන කටයුතු සඳහා භාවිතා කෙරේ.</p>\
  </form>\
  <div id="fbSuccess">\
    <div class="fb-check"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="#1E8F6C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>\
    <h3>නිවන් පිණිසම වේවා!!!</h3>\
    <p>ඔබේ යෝජනාව සාර්ථකව ලැබුණි. පරීක්ෂා කිරීමෙන් අනතුරුව අවශ්‍ය සංශෝධන සිදු කරනු ලැබේ.</p>\
    <button type="button" id="fbAgain">තවත් යෝජනාවක්</button>\
    <button type="button" id="fbDone">වසන්න</button>\
  </div>\
</div>';

  var overlay, card, form, submitBtn, built = false, pushed = false;

  function $(id) { return document.getElementById(id); }

  function build() {
    if (built) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    overlay = document.createElement('div');
    overlay.id = 'fbOverlay';
    overlay.innerHTML = HTML;
    document.body.appendChild(overlay);

    card = $('fbCard');
    form = $('fbForm');
    submitBtn = $('fbSubmit');

    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeFeedback(); });
    $('fbClose').addEventListener('click', closeFeedback);
    $('fbDone').addEventListener('click', closeFeedback);
    $('fbAgain').addEventListener('click', function () { resetForm(''); $('fbPali').focus(); });
    form.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) closeFeedback();
    });
    // Android back button / browser back → card එක වසන්න
    window.addEventListener('popstate', function () {
      if (overlay.classList.contains('show')) { pushed = false; hide(); }
    });
    built = true;
  }

  function resetForm(word) {
    form.reset();
    card.classList.remove('done');
    submitBtn.disabled = false;
    submitBtn.textContent = 'යොමු කරන්න';
    $('fbPali').value = word || '';
  }

  function hide() {
    overlay.classList.remove('show');
    document.body.style.overflow = overlay._prevOverflow || '';
  }

  function openFeedback(word) {
    build();
    resetForm(word);
    overlay._prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.classList.add('show');
    card.scrollTop = 0;
    if (!pushed) { history.pushState({ fb: 1 }, ''); pushed = true; }
    setTimeout(function () { (word ? $('fbErr') : $('fbPali')).focus(); }, 60);
  }

  function closeFeedback() {
    if (!built || !overlay.classList.contains('show')) return;
    hide();
    if (pushed) { pushed = false; history.back(); }
  }

  function onSubmit(e) {
    e.preventDefault();
    var payload = {
      paliWord: $('fbPali').value.trim(),
      errorDesc: $('fbErr').value.trim(),
      correction: $('fbFix').value.trim(),
      newWord: $('fbNew').value.trim(),
      comments: $('fbCom').value.trim(),
      email: $('fbMail').value.trim()
    };

    // අනිවාර්ය ක්ෂේත්‍ර නැත — නමුත් සම්පූර්ණයෙන්ම හිස් පෝරමයක් යැවීම වළක්වයි
    var anyFilled = payload.paliWord || payload.errorDesc || payload.correction ||
                    payload.newWord || payload.comments || payload.email;
    if (!anyFilled) { $('fbCom').focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'යොමු කරමින්...';

    // Apps Script → no-cors (response කියවිය නොහැක, නමුත් Sheet එකට row එක එකතු වේ)
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () {
      card.classList.add('done');
      card.scrollTop = 0;
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'යොමු කරන්න';
      alert('යැවීමේදී දෝෂයක් ඇති විය. නැවත උත්සාහ කරන්න.');
    });
  }

  // [data-feedback] element එකක් click කළවිට (dynamic cards සඳහාද ක්‍රියා කරයි)
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-feedback]') : null;
    if (!t) return;
    e.preventDefault();
    openFeedback(t.getAttribute('data-feedback-word') || '');
  });

  window.openFeedback = openFeedback;
  window.closeFeedback = closeFeedback;
})();
