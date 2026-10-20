/** Progressive enhancement: EventSource carries progress and server-rendered HTML, no saved jobs. */
export const CLIENT = String.raw`
const form = document.querySelector('form');
const input = document.getElementById('repo');
const progress = document.getElementById('scan-progress');
const meter = document.getElementById('scan-meter');
const status = document.getElementById('scan-status');
const output = document.getElementById('scan-output');
let active;

form.addEventListener('submit', (event) => {
  const repo = input.value.trim();
  if (!/^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?$/i.test(repo) || !window.EventSource) return;
  event.preventDefault();
  if (active) active.close();
  output.replaceChildren();
  progress.hidden = false;
  meter.removeAttribute('value');
  status.textContent = 'Listing projects…';
  const source = new EventSource('/events?' + new URLSearchParams({ org: repo }));
  active = source;
  source.onmessage = ({ data }) => {
    const event = JSON.parse(data);
    if (event.type === 'progress') {
      meter.max = event.total || 1;
      meter.value = event.completed;
      status.textContent = 'Scanning ' + event.organization + ': ' + event.completed + '/' + event.total + ' projects';
    } else {
      source.close();
      active = undefined;
      progress.hidden = true;
      output.innerHTML = event.html;
      history.replaceState(null, '', '/?' + new URLSearchParams({ repo }));
      document.title = repo.replace(/\/$/, '').split('/').pop() + ' · Skill Atlas';
    }
  };
  source.onerror = () => {
    source.close();
    active = undefined;
    progress.hidden = true;
    const error = document.createElement('p');
    error.className = 'error';
    error.setAttribute('role', 'alert');
    error.textContent = 'The scan connection was interrupted. Submit Scan to try again.';
    output.replaceChildren(error);
  };
});
window.addEventListener('pagehide', () => { if (active) active.close(); });
`;
