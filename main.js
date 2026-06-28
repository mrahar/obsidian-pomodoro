'use strict';

var obsidian = require('obsidian');

// ─────────────────────────────────────────────────────────────
// ابزارهای تاریخ
// ─────────────────────────────────────────────────────────────

function toJalali(gy, gm, gd) {
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var g = 365*gy + Math.floor((gy2+3)/4) - Math.floor((gy2+99)/100) + Math.floor((gy2+399)/400);
    var gmd = [31,28,31,30,31,30,31,31,30,31,30,31];
    for (var i=0; i<gm-1; i++) g += gmd[i];
    if (gm>2 && ((gy%4===0&&gy%100!==0)||gy%400===0)) g++;
    g += gd;
    var j = g-79, jnp = Math.floor(j/12053);
    j %= 12053;
    var jy = 979+33*jnp+4*Math.floor(j/1461);
    j %= 1461;
    if (j>=366) { jy += Math.floor((j-1)/365); j = (j-1)%365; }
    var jmd = [31,31,31,31,31,31,30,30,30,30,30,29];
    for (i=0; i<11&&j>=jmd[i]; i++) j-=jmd[i];
    return [jy, i+1, j+1];
}

function fa(str) {
    return String(str).replace(/[0-9]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'[d]; });
}

function nowTime() {
    var n = new Date();
    return fa(String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'));
}

// مسیر نت روزانه — مستقیم از تنظیمات Daily Notes اوبسیدین
function getDailyNoteConfig(app) {
    var dn = app.internalPlugins && app.internalPlugins.plugins && app.internalPlugins.plugins['daily-notes'];
    var opts = (dn && dn.instance && dn.instance.options) || {};
    var format = opts.format || 'YYYY-MM-DD';
    var folder = opts.folder || '';
    if (folder && !folder.endsWith('/')) folder += '/';
    return { format: format, folder: folder };
}

// ─────────────────────────────────────────────────────────────
// ثابت‌ها
// ─────────────────────────────────────────────────────────────

var VIEW_TYPE = 'pomodoro-journal-view';
var CIRC = 2 * Math.PI * 54;

var SESSIONS = {
    work:  { label: '🍅 کار'            },
    short: { label: '☕ استراحت کوتاه'  },
    long:  { label: '🌿 استراحت بلند'  }
};

var DEFAULT_CATEGORIES = [
    { v:'مطالعه-کتاب',    l:'📖 مطالعه کتاب'      },
    { v:'دوره-ویدئویی',   l:'🎬 دوره ویدئویی'     },
    { v:'فیلم-سریال',     l:'🎥 فیلم / سریال'     },
    { v:'پروژه-کاری',     l:'💼 پروژه کاری'       },
    { v:'برنامه‌نویسی',   l:'💻 برنامه‌نویسی'     },
    { v:'نوشتن',          l:'✍️ نوشتن / ژورنال'   },
    { v:'تحقیق',          l:'🔍 تحقیق و بررسی'    },
    { v:'جلسه-تماس',      l:'📞 جلسه / تماس'      },
    { v:'مطالعه-مقاله',   l:'📄 مطالعه مقاله'     },
    { v:'ورزش',           l:'🏋️ ورزش'             },
    { v:'برنامه‌ریزی',    l:'🗂️ برنامه‌ریزی'      },
    { v:'دیگر',           l:'📌 دیگر'              }
];

var DEFAULT_PROJECTS = [
    'پارت الکتریک',
    'سورئال',
    'آریانیک',
    'شخصی'
];

var DEFAULT_SETTINGS = {
    workDuration:    25,
    shortBreak:      5,
    longBreak:       15,
    autoStartBreak:  false,
    autoStartWork:   false,
    bellOnComplete:  true,
    autoLog:         true,
    journalHeading:  '## 🍅 پومودورو‌های امروز',
    categories:      null,  // null یعنی از DEFAULT_CATEGORIES استفاده کن
    projects:        null   // null یعنی از DEFAULT_PROJECTS استفاده کن
};

var SOUNDS = [
    {id:'rain',        l:'🌧️ باران'    },
    {id:'storm',       l:'⛈️ طوفان'    },
    {id:'birds-tree',  l:'🌲 جنگل'     },
    {id:'coffee',      l:'☕ کافه'      },
    {id:'waves',       l:'🌊 امواج'    },
    {id:'fire',        l:'🔥 آتش'      },
    {id:'night',       l:'🌙 شب'       },
    {id:'brown-noise', l:'🟤 براون'    },
    {id:'white-noise', l:'⬜ وایت'     }
];

// ─────────────────────────────────────────────────────────────
// ثابت‌های SVG — کش برای جلوگیری از DOM rebuild در هر refresh
// ─────────────────────────────────────────────────────────────

var SVG_PLAY  = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
var SVG_PAUSE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

// ─────────────────────────────────────────────────────────────
// مودال ثبت
// ─────────────────────────────────────────────────────────────

class DoneModal extends obsidian.Modal {
    constructor(app, onOk, taskName, elapsedMin, logFull) {
        super(app);
        this.onOk = onOk;
        this.taskName = taskName;
        this.elapsedMin = elapsedMin;  // دقیقه‌ی واقعی گذشته
        this.logFull = logFull;        // true = ثبت ۲۵ دق، false = ثبت زمان واقعی
    }
    onOpen() {
        var c = this.contentEl;
        c.empty(); c.setAttribute('dir','rtl'); c.addClass('pj-modal');

        c.createEl('div',{text:'🍅',cls:'pj-modal-emoji'});
        c.createEl('h2',{text: this.logFull ? 'ثبت ۲۵ دقیقه' : 'ثبت '+fa(String(this.elapsedMin))+' دقیقه‌ی گذشته'});
        c.createEl('p',{text:'توی این مدت چیکار کردی؟',cls:'pj-modal-q'});

        var ta = c.createEl('textarea',{cls:'pj-modal-ta'});
        ta.placeholder = 'توضیح بده...';
        ta.value = this.taskName;
        setTimeout(function(){ ta.focus(); ta.select(); }, 60);
        c.createEl('p',{text:'⌘+Enter برای ثبت',cls:'pj-modal-hint'});

        var row = c.createEl('div',{cls:'pj-modal-row'});
        var ok = row.createEl('button',{text:'✅ ثبت در ژورنال',cls:'mod-cta'});
        var skip = row.createEl('button',{text:'رد کن',cls:'pj-skip'});
        var self = this;
        ok.onclick = function(){ self.onOk(ta.value.trim()||self.taskName); self.close(); };
        skip.onclick = function(){ self.close(); };
        ta.onkeydown = function(e){
            if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ self.onOk(ta.value.trim()||self.taskName); self.close(); }
        };
    }
    onClose(){ this.contentEl.empty(); }
}

// ─────────────────────────────────────────────────────────────
// View — تب سایدبار
// ─────────────────────────────────────────────────────────────

class PomodoroView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }
    getViewType()    { return VIEW_TYPE; }
    getDisplayText() { return 'پومودورو'; }
    getIcon()        { return 'timer'; }

    async onOpen() {
        this.plugin.view = this;
        var el = this.contentEl;
        el.empty();
        el.setAttribute('dir','rtl');
        el.addClass('pj-root');
        this._build(el);
        this.refresh();
        // اگه قبل از بسته شدن تایمر داشت اجرا می‌شد، دوباره شروعش کن
        var p = this.plugin;
        if(p.state.running && !p.state.paused && !p._timer){
            p.startSession(p.state.task, p.state.project, p.state.cat);
        }
    }

    async onClose() {
        this.plugin.view = null;
    }

    _build(root) {
        var self = this;

        // ── تب‌بار ──
        var tabBar = root.createEl('div',{cls:'pj-tabbar'});
        var tBtns = {
            timer: tabBar.createEl('button',{text:'تایمر', cls:'pj-tb active'}),
            sound: tabBar.createEl('button',{text:'صدا',  cls:'pj-tb'})
        };
        var panes = {
            timer: root.createEl('div',{cls:'pj-pane'}),
            sound: root.createEl('div',{cls:'pj-pane pj-pane-sound'})
        };
        panes.sound.style.display = 'none';

        Object.keys(tBtns).forEach(function(k){
            tBtns[k].onclick = function(){
                Object.values(tBtns).forEach(function(b){ b.classList.remove('active'); });
                tBtns[k].classList.add('active');
                Object.keys(panes).forEach(function(pk){ panes[pk].style.display = pk===k?'':'none'; });
            };
        });

        this._buildTimer(panes.timer);
        this._buildSounds(panes.sound);
    }

    _buildTimer(pane) {
        var self = this, p = this.plugin;
        self._timerPane = pane;
        pane.dataset.type = p.state.type || 'work';

        // ── نوع سشن (pills) ──
        var sessDurations = { work: p.settings.workDuration, short: p.settings.shortBreak, long: p.settings.longBreak };
        var sessRow = pane.createEl('div',{cls:'pj-sess-row'});
        self._sessBtns = {};
        Object.keys(SESSIONS).forEach(function(type){
            var btn = sessRow.createEl('button',{
                text: SESSIONS[type].label,
                cls: 'pj-sess-btn'+(type==='work'?' active':'')
            });
            self._sessBtns[type] = btn;
            btn.onclick = function(){
                if(p.state.running) return;
                Object.values(self._sessBtns).forEach(function(b){ b.classList.remove('active'); });
                btn.classList.add('active');
                var dur = sessDurations[type] * 60;
                p.state.type  = type; p.state.total = dur;
                p.state.secs  = dur;  p.state.elapsed = 0;
                pane.dataset.type = type;
                if(self._slider) self._slider.value = String(sessDurations[type]);
                self.refresh();
            };
        });

        // ── وضعیت ──
        var statusEl = pane.createEl('div',{cls:'pj-status', text:'آماده'});
        self._statusEl = statusEl;

        // ── حلقه‌ی SVG + تایمر بزرگ ──
        var ringWrap = pane.createEl('div',{cls:'pj-ring-wrap'});
        ringWrap.innerHTML =
            '<svg class="pj-ring-svg" viewBox="0 0 200 200">'
            + '<circle class="pj-ring-bg" cx="100" cy="100" r="90"/>'
            + '<circle class="pj-ring-fg" cx="100" cy="100" r="90"/>'
            + '</svg>'
            + '<div class="pj-ring-center">'
            + '<div class="pj-time-txt">۲۵:۰۰</div>'
            + '</div>';
        self._ringFg  = ringWrap.querySelector('.pj-ring-fg');
        self._timeTxt = ringWrap.querySelector('.pj-time-txt');
        var newCirc = 2 * Math.PI * 90;
        self._ringFg.style.strokeDasharray  = newCirc;
        self._ringFg.style.strokeDashoffset = 0;
        self._ringCirc = newCirc;

        // ── دکمه‌ی play (زیر حلقه) ──
        var playBtn = pane.createEl('button',{cls:'pj-play-btn'});
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
        self._startBtn = playBtn;
        playBtn.onclick = function(){
            if(!p.state.running)    p.startSession(taskIn.value, projSel.value, catSel.value);
            else if(p.state.paused) p.resumeSession();
            else                    p.pauseSession();
        };

        // ── نقاط سشن ──
        var dotsWrap = pane.createEl('div',{cls:'pj-dots'});
        for(var di=0; di<4; di++) dotsWrap.createEl('span',{cls:'pj-dot'});
        self._dotsEl = dotsWrap;
        self._dots   = Array.from(dotsWrap.querySelectorAll('.pj-dot'));

        // ── ورودی‌ها ──
        var formCard = pane.createEl('div',{cls:'pj-form-card'});

        // ۱. نوع کار
        var catField = formCard.createEl('div',{cls:'pj-field'});
        catField.createEl('label',{text:'نوع کار', cls:'pj-field-label'});
        var catSel = catField.createEl('select',{cls:'pj-field-select'});
        var activeCats = (p.settings.categories && p.settings.categories.length) ? p.settings.categories : DEFAULT_CATEGORIES;
        activeCats.forEach(function(c){ var o=catSel.createEl('option',{text:c.l}); o.value=c.v; });
        catSel.onchange = function(){ p.state.cat = catSel.value; };
        self._catSel = catSel;

        // ۲. پروژه
        var projField = formCard.createEl('div',{cls:'pj-field'});
        projField.createEl('label',{text:'پروژه', cls:'pj-field-label'});

        var projRow = projField.createEl('div',{cls:'pj-proj-row'});
        var projSel = projRow.createEl('select',{cls:'pj-field-select pj-proj-select'});
        self._projSel = projSel;

        // بازسازی لیست پروژه‌ها در select
        function rebuildProjSelect() {
            projSel.empty();
            var noneOpt = projSel.createEl('option',{text:'— بدون پروژه'});
            noneOpt.value = '—';
            var projs = (p.settings.projects && p.settings.projects.length) ? p.settings.projects : DEFAULT_PROJECTS;
            projs.forEach(function(pr){
                var opt = projSel.createEl('option',{text:pr});
                opt.value = pr;
            });
            projSel.value = (p.state.project && p.state.project !== '—') ? p.state.project : '—';
        }
        rebuildProjSelect();
        self._rebuildProjSelect = rebuildProjSelect;

        projSel.onchange = function(){ p.state.project = projSel.value; };

        // دکمه‌های مدیریت پروژه
        var projActions = projRow.createEl('div',{cls:'pj-proj-actions'});

        // ✏️ تغییر نام
        var projEditBtn = projActions.createEl('button',{text:'✏️', cls:'pj-proj-btn'});
        projEditBtn.title = 'تغییر نام پروژه';
        projEditBtn.onclick = function(){
            var cur = projSel.value;
            if(cur === '—'){ new obsidian.Notice('یه پروژه انتخاب کن', 2000); return; }
            var inp = projField.createEl('input',{cls:'pj-proj-inline-inp'});
            inp.value = cur; inp.placeholder = 'نام جدید...';
            inp.focus(); inp.select();
            var commit = async function(){
                var newName = inp.value.trim();
                inp.remove();
                if(!newName || newName === cur) return;
                var projs = (p.settings.projects && p.settings.projects.length) ? p.settings.projects.slice() : DEFAULT_PROJECTS.slice();
                var idx = projs.indexOf(cur);
                if(idx !== -1) projs[idx] = newName;
                p.settings.projects = projs;
                if(p.state.project === cur) p.state.project = newName;
                await p._saveSettings();
                rebuildProjSelect();
            };
            inp.onblur = commit;
            inp.onkeydown = function(e){
                if(e.key==='Enter') inp.blur();
                if(e.key==='Escape'){ inp.value=cur; inp.blur(); }
            };
        };

        // 🗑️ حذف
        var projDelBtn = projActions.createEl('button',{text:'🗑️', cls:'pj-proj-btn'});
        projDelBtn.title = 'حذف پروژه';
        projDelBtn.onclick = async function(){
            var cur = projSel.value;
            if(cur === '—'){ new obsidian.Notice('یه پروژه انتخاب کن', 2000); return; }
            var projs = (p.settings.projects && p.settings.projects.length) ? p.settings.projects.slice() : DEFAULT_PROJECTS.slice();
            p.settings.projects = projs.filter(function(pr){ return pr !== cur; });
            if(p.state.project === cur) p.state.project = '—';
            await p._saveSettings();
            rebuildProjSelect();
            new obsidian.Notice('🗑️ «' + cur + '» حذف شد', 2000);
        };

        // ➕ پروژه جدید
        var projAddBtn = projActions.createEl('button',{text:'➕', cls:'pj-proj-btn'});
        projAddBtn.title = 'پروژه‌ی جدید';
        projAddBtn.onclick = function(){
            var inp = projField.createEl('input',{cls:'pj-proj-inline-inp'});
            inp.placeholder = 'نام پروژه‌ی جدید...';
            inp.focus();
            var commit = async function(){
                var newName = inp.value.trim();
                inp.remove();
                if(!newName) return;
                var projs = (p.settings.projects && p.settings.projects.length) ? p.settings.projects.slice() : DEFAULT_PROJECTS.slice();
                if(projs.indexOf(newName) === -1) projs.push(newName);
                p.settings.projects = projs;
                p.state.project = newName;
                await p._saveSettings();
                rebuildProjSelect();
                projSel.value = newName;
            };
            inp.onblur = commit;
            inp.onkeydown = function(e){
                if(e.key==='Enter') inp.blur();
                if(e.key==='Escape'){ inp.remove(); }
            };
        };

        // ۳. توضیحات
        var taskField = formCard.createEl('div',{cls:'pj-field pj-field--last'});
        taskField.createEl('label',{text:'توضیحات', cls:'pj-field-label'});
        var taskIn = taskField.createEl('input',{cls:'pj-field-input'});
        taskIn.type='text'; taskIn.placeholder='این سشن رو در یه جمله توضیح بده...';
        taskIn.onkeydown = function(e){ if(e.key==='Enter'&&!p.state.running) p.startSession(taskIn.value, projSel.value, catSel.value); };
        taskIn.oninput = function(){ p.state.task = taskIn.value.trim()||'—'; };
        self._taskIn = taskIn;

        // ── اسلایدر زمان ──
        var sliderWrap = formCard.createEl('div',{cls:'pj-field pj-field--slider'});
        sliderWrap.createEl('label',{text:'مدت سشن', cls:'pj-field-label'});
        var sliderRow = sliderWrap.createEl('div',{cls:'pj-slider-row'});
        sliderRow.createEl('span',{text:'۱',cls:'pj-slider-lbl'});
        var slider = sliderRow.createEl('input');
        slider.type='range'; slider.className='pj-time-slider';
        slider.min='1'; slider.max='60'; slider.value='25';
        var sliderVal = sliderRow.createEl('span',{cls:'pj-slider-lbl pj-slider-val'});
        sliderVal.textContent = fa('25') + ' دق';
        self._slider = slider; self._sliderVal = sliderVal;
        slider.oninput = function(){
            var newSecs = parseInt(slider.value)*60;
            sliderVal.textContent = fa(slider.value) + ' دق';
            if(p.state.running){ p.state.secs=newSecs; p.state.total=p.state.elapsed+newSecs; }
            else { p.state.secs=newSecs; p.state.total=newSecs; p.state.elapsed=0; }
            self.refresh();
        };

        // ── ردیف پایین: ریست + log ──
        var bottomRow = pane.createEl('div',{cls:'pj-bottom-row'});

        var resetBtn = bottomRow.createEl('button',{cls:'pj-icon-btn'});
        resetBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
        resetBtn.title='ریست'; resetBtn.onclick = function(){ p.resetSession(); };

        var logElapsed = bottomRow.createEl('button',{cls:'pj-log-btn pj-log-elapsed'});
        logElapsed.innerHTML = '⏱ ثبت <span class="pj-elapsed-txt">۰</span> دق';
        self._logElapsedBtn = logElapsed;
        self._elapsedSpan   = logElapsed.querySelector('.pj-elapsed-txt');
        logElapsed.onclick = function(){
            if(p.state.elapsed < 60){ new obsidian.Notice('کمتر از ۱ دقیقه گذشته!',3000); return; }
            p._logNow(false);
        };

        var logFull = bottomRow.createEl('button',{text:'✓ ثبت کامل',cls:'pj-log-btn pj-log-full'});
        logFull.onclick = function(){ p._logNow(true); };
        self._logFullBtn = logFull;

        // ── دکمه‌ی رد استراحت — فقط در حالت break نمایش داده می‌شه ──
        var skipBreakBtn = pane.createEl('button',{text:'⏭ رد کردن استراحت  ←  شروع کار',cls:'pj-skip-break-btn'});
        skipBreakBtn.style.display = 'none';
        self._skipBreakBtn = skipBreakBtn;
        skipBreakBtn.onclick = function(){ p.skipBreak(); };
    }

    _buildSounds(pane) {
        var self = this, p = this.plugin;

        var hdr = pane.createEl('div',{cls:'pj-sound-hdr'});
        hdr.createEl('span',{text:'🎵 چند صدا همزمان',cls:'pj-sound-lbl'});
        var stopAll = hdr.createEl('button',{text:'🔇 خاموش همه',cls:'pj-stopall-btn'});
        stopAll.onclick = function(){
            p.stopAllSounds();
            pane.querySelectorAll('.pj-sound-btn').forEach(function(b){ b.classList.remove('active'); });
        };

        var resetAll = hdr.createEl('button',{text:'↺ ریست',cls:'pj-sound-reset-btn'});
        resetAll.title = 'برگشت به حالت اولیه — خاموش کردن همه و ریست volume‌ها';
        resetAll.onclick = function(){
            p.stopAllSounds();
            pane.querySelectorAll('.pj-sound-btn').forEach(function(b){ b.classList.remove('active'); });
            pane.querySelectorAll('input.pj-vol').forEach(function(v){ v.value = '40'; });
            pane.querySelectorAll('.pj-preset-item').forEach(function(r){ r.classList.remove('pj-preset-active'); });
            SOUNDS.forEach(function(s){ delete p.soundSettings[s.id]; });
            p._saveState();
        };

        // ── ترکیب‌های صدا (presets) ──
        if(!p.soundSettings.presets){
            p.soundSettings.presets = [
                { name:'ترکیب ۱', sounds:{} },
                { name:'ترکیب ۲', sounds:{} },
                { name:'ترکیب ۳', sounds:{} }
            ];
        }

        var presetWrap = pane.createEl('div',{cls:'pj-preset-wrap'});
        presetWrap.createEl('div',{text:'ترکیب‌های من', cls:'pj-preset-title'});
        var presetList = presetWrap.createEl('div',{cls:'pj-preset-list'});
        var presetRows = []; // برای آپدیت active state

        p.soundSettings.presets.forEach(function(preset, idx){
            var row = presetList.createEl('div',{cls:'pj-preset-item'});
            presetRows.push(row);

            var isEmpty = !preset.sounds || Object.keys(preset.sounds).length === 0;

            // نام — کلیک = لود | دابل‌کلیک = تغییر نام
            var nameEl = row.createEl('span',{text: preset.name, cls:'pj-preset-name'});
            if(isEmpty) nameEl.classList.add('pj-preset-empty');

            // دکمه‌ی ذخیره
            var saveBtn = row.createEl('button',{text:'💾', cls:'pj-preset-save-btn'});
            saveBtn.title = 'ذخیره‌ی ترکیب فعلی روی این اسلات';

            // لود با کلیک روی نام
            nameEl.onclick = function(){
                if(isEmpty){
                    new obsidian.Notice('این ترکیب هنوز ذخیره نشده — روی 💾 بزن', 3000);
                    return;
                }
                // خاموش کردن همه
                p.stopAllSounds();
                pane.querySelectorAll('.pj-sound-btn').forEach(function(b){ b.classList.remove('active'); });
                // اعمال ترکیب
                SOUNDS.forEach(function(s){
                    var ss = preset.sounds[s.id];
                    if(!ss) return;
                    var volEl = pane.querySelector('input.pj-vol[data-id="'+s.id+'"]');
                    if(volEl) volEl.value = String(Math.round(ss.vol * 100));
                    if(ss.active){
                        p.playSound(s.id, ss.vol);
                        if(self._soundToggles && self._soundToggles[s.id])
                            self._soundToggles[s.id].classList.add('active');
                    }
                    p.soundSettings[s.id] = { vol: ss.vol, active: ss.active };
                });
                // نشون دادن کدوم ترکیب active‌ه
                presetRows.forEach(function(r){ r.classList.remove('pj-preset-active'); });
                row.classList.add('pj-preset-active');
                p._saveState();
            };

            // تغییر نام با دابل‌کلیک
            nameEl.ondblclick = function(e){
                e.stopPropagation();
                var inp = document.createElement('input');
                inp.className = 'pj-preset-name-inp';
                inp.value = preset.name;
                row.insertBefore(inp, nameEl);
                nameEl.style.display = 'none';
                inp.focus(); inp.select();
                var commit = function(){
                    var v = inp.value.trim() || preset.name;
                    preset.name = v;
                    nameEl.textContent = v;
                    nameEl.style.display = '';
                    inp.remove();
                    p._saveState();
                };
                inp.onblur = commit;
                inp.onkeydown = function(e){
                    if(e.key === 'Enter') inp.blur();
                    if(e.key === 'Escape'){ inp.value = preset.name; inp.blur(); }
                };
            };

            // ذخیره‌ی ترکیب فعلی
            saveBtn.onclick = function(){
                var snap = {};
                SOUNDS.forEach(function(s){
                    var volEl = pane.querySelector('input.pj-vol[data-id="'+s.id+'"]');
                    var v = volEl ? parseInt(volEl.value)/100 : 0.4;
                    snap[s.id] = { vol: v, active: !!p.audios[s.id] };
                });
                preset.sounds = snap;
                isEmpty = false;
                nameEl.classList.remove('pj-preset-empty');
                p._saveState();
                new obsidian.Notice('💾 روی «' + preset.name + '» ذخیره شد', 2000);
            };
        });

        var list = pane.createEl('div',{cls:'pj-sound-list'});
        self._soundToggles = {};

        SOUNDS.forEach(function(s){
            var row = list.createEl('div',{cls:'pj-sound-row'});
            var btn = row.createEl('button',{text:s.l,cls:'pj-sound-btn'});
            self._soundToggles[s.id] = btn;
            var vol = row.createEl('input');
            vol.type='range'; vol.className='pj-vol'; vol.min='0'; vol.max='100';
            vol.dataset.id = s.id;

            // بازیابی volume ذخیره‌شده — صدا اتوماتیک پخش نمی‌شه
            var saved = p.soundSettings[s.id];
            var savedVol = saved ? Math.round(saved.vol * 100) : 40;
            vol.value = String(savedVol);

            btn.onclick = function(){
                if(p.audios[s.id]){
                    p.stopSound(s.id);
                    btn.classList.remove('active');
                    p.soundSettings[s.id] = { vol: parseInt(vol.value)/100, active: false };
                } else {
                    p.playSound(s.id, parseInt(vol.value)/100);
                    btn.classList.add('active');
                    p.soundSettings[s.id] = { vol: parseInt(vol.value)/100, active: true };
                }
                p._saveState();
            };
            vol.oninput = function(){
                var v = parseInt(vol.value)/100;
                if(p.audios[s.id]){
                    p.audios[s.id].volume = v;
                    p.soundSettings[s.id] = { vol: v, active: true };
                } else if(v > 0.05){
                    p.playSound(s.id, v);
                    btn.classList.add('active');
                    p.soundSettings[s.id] = { vol: v, active: true };
                } else {
                    p.soundSettings[s.id] = { vol: v, active: false };
                }
                // debounce: حین کشیدن اسلایدر هر ms صدا زده می‌شه — ذخیره‌ی فوری لازم نیست
                p._debouncedSave();
            };
        });
    }

    // ── به‌روزرسانی سبک — فقط نمایش زمان (هر ثانیه یک‌بار) ──
    _tickUI() {
        var p = this.plugin, st = p.state;
        var m = Math.floor(st.secs/60), s = st.secs%60;
        var txt = fa(String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'));

        if(this._timeTxt) this._timeTxt.textContent = txt;

        if(this._ringFg){
            var circ = this._ringCirc || CIRC;
            this._ringFg.style.strokeDashoffset = circ * (1 - st.secs / Math.max(st.total, 1));
        }

        if(this._elapsedSpan){
            var em = Math.floor(st.elapsed/60);
            this._elapsedSpan.textContent = fa(String(em||0));
            this._logElapsedBtn.style.opacity = (st.elapsed >= 60) ? '1' : '0.4';
        }

        if(this._slider && !this._slider.matches(':active')){
            this._slider.value = String(Math.round(st.secs/60));
            if(this._sliderVal)
                this._sliderVal.textContent = fa(String(Math.round(st.secs/60))) + ' دق';
        }
    }

    // ── آپدیت کامل نمایش — هنگام تغییر state (شروع/مکث/ریست) ──
    refresh() {
        var p = this.plugin, st = p.state;

        // به‌روزرسانی زمان
        this._tickUI();

        // آیکن دکمه‌ی play — فقط اگه state عوض شده (جلوگیری از innerHTML بی‌دلیل)
        if(this._startBtn){
            var isPlaying = st.running && !st.paused;
            if(this._lastIsPlaying !== isPlaying || this._lastPausedState !== st.paused){
                this._startBtn.innerHTML = isPlaying ? SVG_PAUSE : SVG_PLAY;
                this._startBtn.classList.toggle('pj-play-btn--paused', !isPlaying && st.paused);
                this._lastIsPlaying   = isPlaying;
                this._lastPausedState = st.paused;
            }
        }

        // وضعیت
        if(this._statusEl){
            this._statusEl.textContent = !st.running ? 'آماده'
                : st.paused ? 'مکث'
                : st.type === 'work' ? 'در حال کار...'
                : 'استراحت...';
        }

        // نقاط — از آرایه‌ی کش‌شده استفاده می‌کنه
        if(this._dots){
            var n = st.count === 0 ? 0 : (st.count % 4 || 4);
            this._dots.forEach(function(d, i){ d.classList.toggle('filled', i < n); });
        }

        // رنگ بر اساس نوع سشن
        if(this._timerPane) this._timerPane.dataset.type = st.type || 'work';

        // دکمه‌ی رد استراحت ↔ دکمه‌های ثبت — فقط یکی نمایش داده می‌شه
        var isBreak = (st.type === 'short' || st.type === 'long');
        if(this._skipBreakBtn)  this._skipBreakBtn.style.display  = isBreak ? '' : 'none';
        if(this._logElapsedBtn) this._logElapsedBtn.style.display = isBreak ? 'none' : '';
        if(this._logFullBtn)    this._logFullBtn.style.display    = isBreak ? 'none' : '';

        // اینپوت‌ها
        if(this._taskIn && document.activeElement !== this._taskIn)
            this._taskIn.value = st.task || '';
        if(this._projSel)
            this._projSel.value = (st.project && st.project !== '—') ? st.project : '—';
        if(this._catSel && st.cat)
            this._catSel.value = st.cat;
    }
}

// ─────────────────────────────────────────────────────────────
// زمان‌بندی هوشمند — دقیقاً یه‌بار در ثانیه، روی مرز ثانیه
// ─────────────────────────────────────────────────────────────

function scheduleNextTick(plugin) {
    // محاسبه‌ی ms تا مرز ثانیه‌ی بعدی (حداقل ۱۰ms برای جلوگیری از fire زودهنگام)
    var ms = 1000 - (Date.now() % 1000);
    if(ms < 10) ms += 1000;
    plugin._timer = setTimeout(function() {
        if(!plugin.state.running || plugin.state.paused) return;
        var wallElapsed = Math.floor((Date.now() - plugin.state.startWall) / 1000);
        plugin.state.secs    = Math.max(0, plugin.state.initSecs - wallElapsed);
        plugin.state.elapsed = plugin.state.pausedElapsed + wallElapsed;
        if(plugin.state.secs <= 0){
            plugin._onTimerDone();
            return;
        }
        if(plugin.view) plugin.view._tickUI();
        scheduleNextTick(plugin);
    }, ms);
}

// ─────────────────────────────────────────────────────────────
// Plugin اصلی
// ─────────────────────────────────────────────────────────────

class PomodoroPlugin extends obsidian.Plugin {

    async onload() {
        var self = this;

        // state پیش‌فرض — از DEFAULT_SETTINGS می‌خونه نه از SESSIONS
        var workSecs = DEFAULT_SETTINGS.workDuration * 60;
        var defaultState = {
            type:'work', secs:workSecs, total:workSecs,
            elapsed:0, pausedElapsed:0, startWall:null, initSecs:workSecs,
            task:'', project:'', cat:'مطالعه-کتاب',
            running:false, paused:false, count:0
        };

        // بازیابی داده‌های ذخیره‌شده از دیسک
        var saved = await this.loadData();
        this.settings     = Object.assign({}, DEFAULT_SETTINGS, (saved && saved.settings) || {});
        this.state        = Object.assign({}, defaultState, (saved && saved.state) || {});
        this.soundSettings = (saved && saved.sounds) || {};

        // اگه موقع بسته شدن، تایمر داشت اجرا می‌شد → زمان واقعی گذشته رو حساب کن
        if(this.state.running && !this.state.paused && this.state.startWall){
            var wallElapsed = Math.floor((Date.now() - this.state.startWall) / 1000);
            var remaining   = this.state.initSecs - wallElapsed;
            if(remaining <= 0){
                // وقت تموم شده بود — ثبت و ریست
                new obsidian.Notice('🍅 پومودورو در پس‌زمینه تموم شد!', 6000);
                if(this.state.type === 'work'){
                    this.state.count++;
                    // مقادیر مهم رو قبل از ریست state ذخیره می‌کنیم —
                    // چون بعد از Object.assign، state کلاً پاک می‌شه
                    var bgTask      = this.state.task || 'بدون عنوان';
                    var bgTotal     = this.state.total;
                    var bgTimeStr   = this.state.startTimeStr;
                    // ثبت با تاخیر تا vault آماده بشه
                    setTimeout(function(){
                        self.state.startTimeStr = bgTimeStr;
                        self._logToJournal(bgTask, bgTotal);
                    }, 2000);
                }
                this.state = Object.assign({}, defaultState, { count: this.state.count });
            } else {
                // هنوز وقت مونده — secs رو آپدیت کن، تایمر بعداً از view شروع می‌شه
                this.state.secs    = remaining;
                this.state.elapsed = this.state.pausedElapsed + wallElapsed;
                // startWall رو ریست کن تا startSession دوباره تنظیمش کنه
                this.state.startWall = null;
            }
        }

        this.audios  = {};
        this._timer  = null;
        this.view    = null;

        this.registerView(VIEW_TYPE, function(leaf){ return new PomodoroView(leaf, self); });

        this.addRibbonIcon('timer', '🍅 پومودورو', function(){ self.openView(); });

        this.addCommand({ id:'pomo-open', name:'باز کردن پنل پومودورو', callback: function(){ self.openView(); } });

        this.addSettingTab(new PomodoroSettingTab(this.app, this));

        console.log('🍅 Pomodoro Journal v2 loaded');
    }

    onunload() {
        // state فعلی رو روی دیسک ذخیره کن
        this._saveState();
        if(this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
        if(this._timer) clearTimeout(this._timer);
        var self = this;
        Object.keys(this.audios).forEach(function(id){
            try{ self.audios[id].pause(); }catch(e){}
        });
    }

    _saveState() {
        this.saveData({
            settings: this.settings,
            sounds:   this.soundSettings || {},
            state: {
                type:          this.state.type,
                secs:          this.state.secs,
                total:         this.state.total,
                elapsed:       this.state.elapsed,
                pausedElapsed: this.state.pausedElapsed,
                startWall:     (this.state.running && !this.state.paused) ? Date.now() - (this.state.initSecs - this.state.secs) * 1000 : null,
                initSecs:      this.state.secs,
                task:          this.state.task,
                project:       this.state.project,
                cat:           this.state.cat,
                running:       this.state.running,
                paused:        this.state.paused,
                count:         this.state.count,
                startTimeStr:  this.state.startTimeStr
            }
        });
    }

    async _saveSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, this.settings);
        await this._saveState();
    }

    // ذخیره‌ی debounce‌شده — برای callbackهایی که سریع و پشت‌سرهم صدا زده می‌شن (مثل volume slider)
    _debouncedSave() {
        var self = this;
        if(self._saveDebounceTimer) clearTimeout(self._saveDebounceTimer);
        self._saveDebounceTimer = setTimeout(function(){ self._saveState(); }, 300);
    }

    async openView() {
        var ws = this.app.workspace;
        var leaves = ws.getLeavesOfType(VIEW_TYPE);
        if(leaves.length){ ws.revealLeaf(leaves[0]); return; }
        var leaf = ws.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        ws.revealLeaf(leaf);
    }

    // ── تایمر ──

    startSession(task, project, cat) {
        var self = this;
        self.state.task    = (task||'بدون عنوان').trim() || 'بدون عنوان';
        self.state.project = (project||'—').trim() || '—';
        self.state.cat     = cat || 'دیگر';
        self.state.running = true;
        self.state.paused  = false;
        // ذخیره‌ی زمان شروع واقعی — برای محاسبه‌ی wall-clock
        self.state.startWall = Date.now();
        self.state.initSecs  = self.state.secs;   // ثانیه‌های باقی‌مانده هنگام شروع این سگمنت
        // زمان شروع فارسی — فقط اولین بار (resume نباشه)
        if(!self.state.paused && !self.state.startTimeStr){
            var _n = new Date();
            self.state.startTimeStr = fa(String(_n.getHours()).padStart(2,'0') + ':' + String(_n.getMinutes()).padStart(2,'0'));
        }
        if(self._timer) clearTimeout(self._timer);
        // یه‌بار موقع شروع ذخیره کن، بعد هر ثانیه یه tick دقیق روی مرز ثانیه
        self._saveState();
        scheduleNextTick(self);
        if(self.view) self.view.refresh();
    }

    pauseSession() {
        clearTimeout(this._timer);
        // زمان واقعی گذشته رو ذخیره کن
        var wallElapsed = Math.floor((Date.now() - this.state.startWall) / 1000);
        this.state.secs          = Math.max(0, this.state.initSecs - wallElapsed);
        this.state.pausedElapsed = this.state.pausedElapsed + wallElapsed;
        this.state.elapsed       = this.state.pausedElapsed;
        this.state.paused        = true;
        this._saveState();
        if(this.view) this.view.refresh();
    }

    resumeSession() {
        this.state.paused = false;
        // startSession از secs فعلی شروع می‌کنه (که pauseSession آپدیتش کرده)
        this.startSession(this.state.task, this.state.project, this.state.cat);
    }

    resetSession() {
        clearTimeout(this._timer);
        // task، project و cat حفظ می‌شن تا سشن بعدی نیازی به تایپ مجدد نباشه
        this.state.running       = false;
        this.state.paused        = false;
        this.state.secs          = this.state.total;
        this.state.elapsed       = 0;
        this.state.pausedElapsed = 0;
        this.state.startWall     = null;
        this.state.initSecs      = this.state.total;
        this.state.startTimeStr  = null;
        this._saveState();
        if(this.view) this.view.refresh();
    }

    _onTimerDone() {
        var self = this;
        var cfg  = self.settings;
        var wasWork  = self.state.type === 'work';
        var wasBreak = self.state.type === 'short' || self.state.type === 'long';

        self.state.running = false;
        if(cfg.bellOnComplete) self._bell();

        if(wasWork){
            self.state.count++;
            new obsidian.Notice('🍅 سشن کاری تموم شد!', 5000);
            if(self.state.count % 4 === 0) new obsidian.Notice('🎉 ۴ پومودورو! وقت استراحت بلنده 🌿', 6000);
            if(cfg.autoLog) self._logToJournal(self.state.task || 'بدون عنوان', self.state.total);
        } else if(wasBreak){
            new obsidian.Notice('☕ استراحت تموم شد! بریم سراغ کار 💪', 5000);
        }

        self.resetSession();

        // شروع خودکار سشن بعدی
        if(wasWork && cfg.autoStartBreak){
            var breakType = (self.state.count % 4 === 0) ? 'long' : 'short';
            self.state.type  = breakType;
            self.state.total = cfg[breakType === 'long' ? 'longBreak' : 'shortBreak'] * 60;
            self.state.secs  = self.state.total;
            setTimeout(function(){ self.startSession(self.state.task, self.state.project, self.state.cat); }, 500);
        } else if(wasBreak && cfg.autoStartWork){
            self.state.type  = 'work';
            self.state.total = cfg.workDuration * 60;
            self.state.secs  = self.state.total;
            setTimeout(function(){ self.startSession(self.state.task, self.state.project, self.state.cat); }, 500);
        }
    }

    skipBreak() {
        clearTimeout(this._timer);
        this._timer = null;
        var workSecs = this.settings.workDuration * 60;
        this.state.type          = 'work';
        this.state.total         = workSecs;
        this.state.secs          = workSecs;
        this.state.elapsed       = 0;
        this.state.pausedElapsed = 0;
        this.state.startWall     = null;
        this.state.initSecs      = workSecs;
        this.state.startTimeStr  = null;
        this.state.running       = false;
        this.state.paused        = false;
        // آپدیت pill به حالت «کار»
        if(this.view && this.view._sessBtns){
            var btns = this.view._sessBtns;
            Object.values(btns).forEach(function(b){ b.classList.remove('active'); });
            if(btns.work) btns.work.classList.add('active');
        }
        // آپدیت اسلایدر به مدت سشن کاری
        if(this.view && this.view._slider){
            this.view._slider.value = String(this.settings.workDuration);
            if(this.view._sliderVal)
                this.view._sliderVal.textContent = fa(String(this.settings.workDuration)) + ' دق';
        }
        // شروع خودکار سشن کاری
        this.startSession(this.state.task, this.state.project, this.state.cat);
    }

    _logNow(logFull) {
        // دکمه‌های دستی — بدون مودال، مستقیم ثبت می‌کنه
        var self = this;
        var elapsedMin = Math.max(1, Math.floor(self.state.elapsed / 60));
        var secs = logFull ? self.state.total : (elapsedMin * 60);
        self._logToJournal(self.state.task || 'بدون عنوان', secs);
        // resetSession صدا می‌زنیم تا startTimeStr هم پاک بشه —
        // بدون این، سشن بعدی همون تایم شروع قبلی رو ثبت می‌کرد
        self.resetSession();
    }

    _bell() {
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if(!AudioCtx) return;
            var ctx = new AudioCtx();

            // صدای bell مدیتیشن — فاندامنتال + هارمونیک‌ها با decay طولانی
            var tone = function(freq, vol, startAt, dur){
                var osc  = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
                gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startAt + 0.008);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + dur);
                osc.start(ctx.currentTime + startAt);
                osc.stop(ctx.currentTime + startAt + dur);
            };

            // ضربه‌ی اول — سه هارمونیک
            tone(528,  0.45, 0,   3.0);
            tone(1056, 0.20, 0,   2.5);
            tone(1584, 0.10, 0,   2.0);

            // ضربه‌ی دوم (کمی بعد، کمی آروم‌تر)
            tone(528,  0.30, 1.4, 2.5);
            tone(792,  0.15, 1.4, 2.0);

            setTimeout(function(){ try{ ctx.close(); }catch(e){} }, 5000);
        } catch(e){ console.warn('[Pomo] bell:', e); }
    }

    // ── صدا ──

    playSound(soundId, vol) {
        try {
            var url = this.app.vault.adapter.getResourcePath(
                this.manifest.dir + '/sounds/' + soundId + '.ogg'
            );
            var audio = new Audio(url);
            audio.loop = true;
            audio.volume = vol != null ? vol : 0.4;
            audio.play().catch(function(e){ console.warn('[Pomo] sound error:', e); });
            this.audios[soundId] = audio;
        } catch(e){ console.error('[Pomo] playSound:', e); }
    }

    stopSound(soundId) {
        if(this.audios[soundId]){
            try{ this.audios[soundId].pause(); this.audios[soundId].currentTime=0; }catch(e){}
            delete this.audios[soundId];
        }
    }

    stopAllSounds() {
        var self = this;
        Object.keys(this.audios).forEach(function(id){ self.stopSound(id); });
    }

    // ── ثبت در ژورنال ──

    async _logToJournal(desc, actualSecs) {
        try {
            // تایم شروع و اطلاعات state رو قبل از هر await ذخیره می‌کنیم —
            // چون بعد از await، ممکنه resetSession صدا زده شده باشه و state پاک شده باشه
            var timeStr  = this.state.startTimeStr || nowTime();
            var stateCat = this.state.cat;
            var stateProject = this.state.project;

            // مسیر رو از تنظیمات Daily Notes اوبسیدین می‌خونیم
            var cfg      = getDailyNoteConfig(this.app);
            var fileName = window.moment().format(cfg.format) + '.md';
            var path     = cfg.folder + fileName;

            // پیدا کردن فایل روزانه
            var f = this.app.vault.getAbstractFileByPath(path);
            if(!f){
                new obsidian.Notice('❌ نت روزانه پیدا نشد:\n' + path, 8000);
                return;
            }

            var content = await this.app.vault.read(f);
            var durMin  = Math.round(actualSecs / 60);
            var dur     = fa(String(durMin));

            // لیبل دسته‌بندی (با ایموجی)
            var activeCats = (this.settings.categories && this.settings.categories.length) ? this.settings.categories : DEFAULT_CATEGORIES;
            var catLabel = stateCat;
            for(var ci = 0; ci < activeCats.length; ci++){
                if(activeCats[ci].v === stateCat){ catLabel = activeCats[ci].l; break; }
            }

            // سطر جدید
            var newRow = '| ' + timeStr + ' | ' + catLabel + ' | ' + stateProject + ' | ' + desc + ' | ' + dur + ' |';
            var heading = this.settings.journalHeading || DEFAULT_SETTINGS.journalHeading;

            var lines = content.split('\n');

            // پیدا کردن خط هدینگ
            var hLine = -1;
            for(var i = 0; i < lines.length; i++){
                if(lines[i].indexOf(heading) !== -1){ hLine = i; break; }
            }

            if(hLine !== -1){
                // جدول وجود داره — آخرین سطر | رو پیدا کن و بعدش اضافه کن
                var lastPipeLine = hLine;
                for(var j = hLine + 1; j < lines.length; j++){
                    if(lines[j].startsWith('|')){
                        lastPipeLine = j;
                    } else if(lastPipeLine > hLine){
                        // اولین خط غیر-جدولی بعد از جدول → جدول تموم شد
                        break;
                    }
                }
                lines.splice(lastPipeLine + 1, 0, newRow);
            } else {
                // تمپلت قدیمیه و بخش وجود نداره — fallback: اضافه کن قبل از ---
                var dashLine = -1;
                for(var k = lines.length - 1; k >= 0; k--){
                    if(lines[k].trim() === '---'){ dashLine = k; break; }
                }
                var section = [
                    '',
                    heading,
                    '',
                    '| زمان | دسته | پروژه | توضیح | ⏱️ |',
                    '|:----:|------|-------|-------|:--:|',
                    newRow,
                    ''
                ];
                if(dashLine !== -1){
                    lines.splice(dashLine, 0, ...section);
                } else {
                    lines.push(...section);
                }
            }

            await this.app.vault.modify(f, lines.join('\n'));
            new obsidian.Notice('✅ ثبت شد! (' + dur + ' دقیقه)', 3000);
        } catch(e){
            new obsidian.Notice('❌ خطا: ' + e.message, 5000);
            console.error('[Pomo] log error:', e);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// صفحه‌ی تنظیمات
// ─────────────────────────────────────────────────────────────

class PomodoroSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        var p   = this.plugin;
        var cfg = p.settings;
        var el  = this.containerEl;
        el.empty();
        el.setAttribute('dir', 'rtl');

        // ── تایمر ──
        el.createEl('h3', {text: '⏱️ تایمر'});

        new obsidian.Setting(el)
            .setName('مدت سشن کاری')
            .setDesc('به دقیقه — پیش‌فرض: ۲۵')
            .addText(function(t){
                t.inputEl.type = 'number';
                t.inputEl.min  = '1';
                t.inputEl.max  = '120';
                t.setValue(String(cfg.workDuration));
                t.onChange(async function(v){
                    cfg.workDuration = Math.max(1, parseInt(v)||25);
                    await p._saveSettings();
                });
            });

        new obsidian.Setting(el)
            .setName('مدت استراحت کوتاه')
            .setDesc('به دقیقه — پیش‌فرض: ۵')
            .addText(function(t){
                t.inputEl.type = 'number';
                t.inputEl.min  = '1';
                t.inputEl.max  = '60';
                t.setValue(String(cfg.shortBreak));
                t.onChange(async function(v){
                    cfg.shortBreak = Math.max(1, parseInt(v)||5);
                    await p._saveSettings();
                });
            });

        new obsidian.Setting(el)
            .setName('مدت استراحت بلند')
            .setDesc('به دقیقه — پیش‌فرض: ۱۵')
            .addText(function(t){
                t.inputEl.type = 'number';
                t.inputEl.min  = '1';
                t.inputEl.max  = '120';
                t.setValue(String(cfg.longBreak));
                t.onChange(async function(v){
                    cfg.longBreak = Math.max(1, parseInt(v)||15);
                    await p._saveSettings();
                });
            });

        new obsidian.Setting(el)
            .setName('شروع خودکار استراحت')
            .setDesc('بعد از اتمام سشن کاری، استراحت رو خودکار شروع کن')
            .addToggle(function(t){
                t.setValue(cfg.autoStartBreak);
                t.onChange(async function(v){
                    cfg.autoStartBreak = v;
                    await p._saveSettings();
                });
            });

        new obsidian.Setting(el)
            .setName('شروع خودکار سشن کاری')
            .setDesc('بعد از اتمام استراحت، سشن کاری رو خودکار شروع کن')
            .addToggle(function(t){
                t.setValue(cfg.autoStartWork);
                t.onChange(async function(v){
                    cfg.autoStartWork = v;
                    await p._saveSettings();
                });
            });

        // ── ژورنال ──
        el.createEl('h3', {text: '📓 ثبت در ژورنال'});

        new obsidian.Setting(el)
            .setName('ثبت خودکار پس از اتمام سشن')
            .setDesc('وقتی تایمر تموم شد، بدون سوال در نت روزانه ثبت کنه')
            .addToggle(function(t){
                t.setValue(cfg.autoLog);
                t.onChange(async function(v){
                    cfg.autoLog = v;
                    await p._saveSettings();
                });
            });

        new obsidian.Setting(el)
            .setName('عنوان بخش پومودورو در نت روزانه')
            .setDesc('هدینگی که پلاگین دنبالش می‌گرده تا جدول رو پیدا کنه')
            .addText(function(t){
                t.setValue(cfg.journalHeading);
                t.inputEl.style.width = '100%';
                t.onChange(async function(v){
                    cfg.journalHeading = v.trim() || DEFAULT_SETTINGS.journalHeading;
                    await p._saveSettings();
                });
            });

        // ── صدا ──
        el.createEl('h3', {text: '🔔 صدا'});

        new obsidian.Setting(el)
            .setName('پخش bell هنگام اتمام سشن')
            .setDesc('یه صدای آروم برای اعلام پایان هر سشن (کار یا استراحت)')
            .addToggle(function(t){
                t.setValue(cfg.bellOnComplete);
                t.onChange(async function(v){
                    cfg.bellOnComplete = v;
                    await p._saveSettings();
                });
            });

        // ── پروژه‌ها ──
        el.createEl('h3', {text: '📁 پروژه‌ها'});
        el.createEl('p', {
            text: 'پروژه‌هایی که توی منوی کشویی تایمر نشون داده می‌شن. می‌تونی اضافه، ویرایش یا حذف کنی.',
            cls: 'setting-item-description'
        });

        if(!p.settings.projects || !p.settings.projects.length){
            p.settings.projects = DEFAULT_PROJECTS.slice();
        }

        var projList = el.createEl('div', {cls:'pj-cat-list'});

        function renderProjList() {
            projList.empty();
            p.settings.projects.forEach(function(proj, idx){
                var row = projList.createEl('div', {cls:'pj-cat-row'});
                var inp = row.createEl('input', {cls:'pj-cat-label-inp'});
                inp.value = proj;
                inp.placeholder = 'نام پروژه';
                inp.onchange = async function(){
                    var newName = inp.value.trim();
                    if(!newName) return;
                    p.settings.projects[idx] = newName;
                    await p._saveSettings();
                    if(p.view && p.view._rebuildProjSelect) p.view._rebuildProjSelect();
                };
                var delBtn = row.createEl('button', {text:'🗑️', cls:'pj-cat-del-btn'});
                delBtn.title = 'حذف';
                delBtn.onclick = async function(){
                    p.settings.projects.splice(idx, 1);
                    await p._saveSettings();
                    renderProjList();
                    if(p.view && p.view._rebuildProjSelect) p.view._rebuildProjSelect();
                };
            });
            var addRow = projList.createEl('div', {cls:'pj-cat-add-row'});
            var addInp = addRow.createEl('input', {cls:'pj-cat-label-inp'});
            addInp.placeholder = '+ پروژه‌ی جدید';
            var addBtn = addRow.createEl('button', {text:'افزودن', cls:'pj-cat-add-btn'});
            addBtn.onclick = async function(){
                var label = addInp.value.trim();
                if(!label) return;
                if(!p.settings.projects) p.settings.projects = [];
                if(p.settings.projects.indexOf(label) === -1) p.settings.projects.push(label);
                await p._saveSettings();
                addInp.value = '';
                renderProjList();
                if(p.view && p.view._rebuildProjSelect) p.view._rebuildProjSelect();
            };
            addInp.onkeydown = function(e){ if(e.key === 'Enter') addBtn.click(); };
        }
        renderProjList();

        new obsidian.Setting(el)
            .setName('بازگشت به پروژه‌های پیش‌فرض')
            .setDesc('لیست پروژه‌ها رو به حالت اولیه برگردون')
            .addButton(function(b){
                b.setButtonText('ریست پروژه‌ها').setWarning();
                b.onClick(async function(){
                    p.settings.projects = DEFAULT_PROJECTS.slice();
                    await p._saveSettings();
                    renderProjList();
                    if(p.view && p.view._rebuildProjSelect) p.view._rebuildProjSelect();
                    new obsidian.Notice('✅ پروژه‌ها به پیش‌فرض برگشت', 3000);
                });
            });

        // ── دسته‌بندی‌ها ──
        el.createEl('h3', {text: '📋 دسته‌بندی‌ها'});
        el.createEl('p', {
            text: 'دسته‌هایی که توی منوی کشویی تایمر نشون داده می‌شن. می‌تونی ویرایش، حذف یا اضافه کنی.',
            cls: 'setting-item-description'
        });

        if(!p.settings.categories || !p.settings.categories.length){
            p.settings.categories = DEFAULT_CATEGORIES.map(function(c){ return Object.assign({}, c); });
        }

        var catList = el.createEl('div', {cls:'pj-cat-list'});

        function renderCatList() {
            catList.empty();
            p.settings.categories.forEach(function(cat, idx){
                var row = catList.createEl('div', {cls:'pj-cat-row'});

                var labelInp = row.createEl('input', {cls:'pj-cat-label-inp'});
                labelInp.value = cat.l;
                labelInp.placeholder = 'مثلاً 📖 مطالعه کتاب';
                labelInp.onchange = async function(){
                    cat.l = labelInp.value.trim() || cat.l;
                    await p._saveSettings();
                };

                var delBtn = row.createEl('button', {text:'🗑️', cls:'pj-cat-del-btn'});
                delBtn.title = 'حذف این دسته';
                delBtn.onclick = async function(){
                    p.settings.categories.splice(idx, 1);
                    await p._saveSettings();
                    renderCatList();
                };
            });

            // دکمه‌ی افزودن
            var addRow = catList.createEl('div', {cls:'pj-cat-add-row'});
            var addInp = addRow.createEl('input', {cls:'pj-cat-label-inp'});
            addInp.placeholder = '+ دسته‌ی جدید (مثلاً 🎮 بازی)';
            var addBtn = addRow.createEl('button', {text:'افزودن', cls:'pj-cat-add-btn'});
            addBtn.onclick = async function(){
                var label = addInp.value.trim();
                if(!label) return;
                var val = label.replace(/\s+/g,'-').replace(/[^\w؀-ۿ\-]/g,'') || ('cat-' + Date.now());
                p.settings.categories.push({ v: val, l: label });
                await p._saveSettings();
                addInp.value = '';
                renderCatList();
            };
            addInp.onkeydown = function(e){ if(e.key === 'Enter') addBtn.click(); };
        }

        renderCatList();

        new obsidian.Setting(el)
            .setName('بازگشت به دسته‌های پیش‌فرض')
            .setDesc('لیست دسته‌بندی‌ها رو به حالت اولیه برگردون')
            .addButton(function(b){
                b.setButtonText('ریست دسته‌ها').setWarning();
                b.onClick(async function(){
                    p.settings.categories = DEFAULT_CATEGORIES.map(function(c){ return Object.assign({}, c); });
                    await p._saveSettings();
                    renderCatList();
                    new obsidian.Notice('✅ دسته‌بندی‌ها به پیش‌فرض برگشت', 3000);
                });
            });

        // ── دکمه‌ی ریست کل تنظیمات ──
        el.createEl('h3', {text: '⚙️ بازنشانی'});
        new obsidian.Setting(el)
            .setName('بازگشت به تنظیمات پیش‌فرض')
            .setDesc('همه‌ی تنظیمات (شامل دسته‌بندی‌ها) رو به مقدار اولیه برگردون')
            .addButton(function(b){
                b.setButtonText('ریست کامل').setWarning();
                b.onClick(async function(){
                    p.settings = Object.assign({}, DEFAULT_SETTINGS, {
                        categories: DEFAULT_CATEGORIES.map(function(c){ return Object.assign({}, c); })
                    });
                    await p._saveSettings();
                    renderCatList();
                    new obsidian.Notice('✅ تنظیمات به پیش‌فرض برگشت', 3000);
                });
            });
    }
}

module.exports = PomodoroPlugin;
