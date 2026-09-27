// The chapter bar: which chapter is on, the phone's chapter list, and Play/Pause.
export function createChapters(nav, { onPlay }) {
  const current = nav.querySelector('.ch-current');
  const list = nav.querySelector('.ch-list');
  const play = nav.querySelector('.ch-play');
  const label = play?.querySelector('span');
  const links = new Map([...list.querySelectorAll('a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const open = (on) => {
    nav.classList.toggle('is-open', on);
    current?.setAttribute('aria-expanded', String(on));
  };
  if (current) current.hidden = false;
  current?.addEventListener('click', () => open(!nav.classList.contains('is-open')));
  list.addEventListener('click', (e) => { if (e.target.closest('a')) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) open(false); });
  if (play) {
    play.hidden = false;
    play.addEventListener('click', onPlay);
  }
  let cur;
  return {
    setChapter(id) {
      if (id === cur) return;
      links.get(cur)?.removeAttribute('aria-current');
      links.get(id)?.setAttribute('aria-current', 'true');
      if (current) current.textContent = links.get(id)?.textContent ?? 'Chapters';
      cur = id;
    },
    setPlaying(on) {
      if (!play) return;
      play.classList.toggle('is-playing', on);
      play.setAttribute('aria-pressed', String(on));
      if (label) label.textContent = on ? 'Pause' : 'Play';
    },
  };
}
