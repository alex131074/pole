/* Поведение страницы: открыто ли сейчас, поле и букет, витрина по сезонам, отзывы, форма. */
(function () {
  var TG = 'https://t.me/+79658775220', MAX = 'https://max.ru/u/f9LHodD0cOIYXQTZcJeIDggBlzbViit68Pu13Kn8IqC7z3roCxtPSiRVg2c';
  var WRITE = 'Напишите нам в <a href="' + TG + '" target="_blank" rel="noopener">Telegram</a> или <a href="' + MAX + '" target="_blank" rel="noopener">MAX</a>';
  var FORM_ENDPOINT = ''; /* {{адрес приёма заявок}} */
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return document.getElementById(id); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var hero = $('hero'), bar = $('bar'), contacts = $('contacts');

  /* Время в Омске (UTC+6): Пн–Пт 9:30–19:30, Сб–Вс 10:00–18:00 */
  var o = new Date(Date.now() + 6 * 3600000), d = o.getUTCDay(), m = o.getUTCHours() * 60 + o.getUTCMinutes();
  function hrs(day) { return day === 0 || day === 6 ? [600, 1080] : [570, 1170]; }
  function fmt(x) { return Math.floor(x / 60) + ':' + ('0' + x % 60).slice(-2); }
  var t = hrs(d), open = m >= t[0] && m < t[1], now = $('now');
  now.textContent = open ? 'Сейчас открыто до ' + fmt(t[1]) : (m < t[0] ? 'Откроемся в ' + fmt(t[0]) : 'Завтра с ' + fmt(hrs((d + 1) % 7)[0]));
  now.classList.toggle('off', !open);
  now.hidden = false;

  /* поле → букет */
  var g = $('gather'), gt = $('gatherT'), on = false;
  g.addEventListener('click', function () {
    on = !on; g.setAttribute('aria-pressed', on ? 'true' : 'false');
    gt.innerHTML = on ? 'Вернуть цветы в&nbsp;поле' : 'Собрать букет из&nbsp;поля';
    if (window.PF) PF.gather(on);
  });
  if (!matchMedia('(hover:hover)').matches) $('hint').textContent = 'проведите пальцем – поднимется ветер';

  /* витрина по сезонам */
  var CAP = ['Снег на&nbsp;Пушкина и&nbsp;ёлка у&nbsp;входа.', 'Солнце, зелень у&nbsp;двери и&nbsp;вывеска «цветы».', 'Сухоцветы и&nbsp;колосья в&nbsp;высокой вазе у&nbsp;входа.', 'Пампасная трава, подсолнухи и&nbsp;полки у&nbsp;окна.'];
  var ss = all('.ss'), fr = all('.fr'), cap = $('sCap');
  ss.forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-s');
      ss.forEach(function (x, j) { x.classList.toggle('on', i === j); x.setAttribute('aria-selected', i === j ? 'true' : 'false'); });
      fr.forEach(function (x, j) { x.classList.toggle('on', i === j); });
      cap.innerHTML = CAP[i];
    });
  });

  function update() {
    var H = innerHeight, hr = hero.getBoundingClientRect(), cr = contacts.getBoundingClientRect();
    if (window.PF) { PF.live(hr.bottom > 0); PF.scroll(-hr.top / Math.max(1, hr.height)); }
    bar.classList.toggle('on', hr.bottom < H * .3 && cr.top > H * .6);
  }
  var ticking = false;
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); } }, { passive: true });
  addEventListener('resize', update);
  update();

  if (!reduce && 'IntersectionObserver' in window) {
    var rise = all('.sec h2,.sec .sub,.word,.three li,.b,.price,.big,.frames,.steps li,.score,.rev,.maplink,.form');
    rise.forEach(function (el) { el.classList.add('rise'); });
    var seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rise.forEach(function (el) { seen.observe(el); });
  }

  var more = $('revMore'), btn = $('revBtn');
  btn.addEventListener('click', function () {
    more.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); btn.hidden = true;
    all('.rise', more).forEach(function (el) { el.classList.add('in'); });
  });

  var form = $('form'), fm = $('formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ph = form.elements.phone, ok = ph.value.replace(/\D/g, '').length >= 10;
    ph.classList.toggle('invalid', !ok);
    if (!ok) { fm.textContent = 'Укажите телефон, чтобы мы могли связаться.'; ph.focus(); return; }
    if (!FORM_ENDPOINT) { fm.innerHTML = 'Заявки с сайта пока не подключены, поэтому ваш номер не отправлен. ' + WRITE + '.'; return; }
    fetch(FORM_ENDPOINT, { method: 'POST', body: new FormData(form) })
      .then(function (r) { if (!r.ok) throw 0; fm.textContent = 'Заявка принята, свяжемся с вами.'; form.reset(); })
      .catch(function () { fm.innerHTML = 'Заявка не отправилась. ' + WRITE + '.'; });
  });
})();
