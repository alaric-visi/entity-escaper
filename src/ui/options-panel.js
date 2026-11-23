/**
 * Builds the per-format options panel from a codec's option definitions, so
 * a new codec (or a new option) needs no HTML changes.
 */
import { optionsFor } from '../codecs/index.js';

/** @typedef {import('../codecs/types.js').Codec} Codec */
/** @typedef {import('../codecs/types.js').CodecOption} CodecOption */
/** @typedef {import('../codecs/types.js').Direction} Direction */
/** @typedef {import('../codecs/types.js').OptionValues} OptionValues */

/**
 * @param {CodecOption} option
 * @param {string} idPrefix
 */
function buildControl(option, idPrefix) {
  const id = `${idPrefix}-${option.id}`;
  const hintId = `${id}-hint`;
  const wrapper = document.createElement('div');
  wrapper.className = `option option--${option.type}`;

  const hint = document.createElement('p');
  hint.className = 'option__hint';
  hint.id = hintId;

  if (option.type === 'checkbox') {
    const label = document.createElement('label');
    label.className = 'checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.dataset.optionId = option.id;
    input.setAttribute('aria-describedby', hintId);
    label.append(input, ` ${option.label}`);
    wrapper.append(label, hint);
  } else {
    const label = document.createElement('label');
    label.className = 'option__label';
    label.htmlFor = id;
    label.textContent = option.label;
    const select = document.createElement('select');
    select.className = 'select';
    select.id = id;
    select.dataset.optionId = option.id;
    select.setAttribute('aria-describedby', hintId);
    for (const choice of option.choices) select.add(new Option(choice.label, choice.value));
    wrapper.append(label, select, hint);
  }
  return wrapper;
}

/**
 * Short text describing the non-default settings, for the panel's summary.
 *
 * @param {Codec} codec
 * @param {Direction} direction
 * @param {OptionValues} values
 */
export function describeOptions(codec, direction, values) {
  const changed = [];
  for (const option of optionsFor(codec, direction)) {
    const value = values[option.id];
    if (value === option.default) continue;
    if (option.type === 'checkbox') {
      if (value) changed.push(option.label);
    } else {
      changed.push(option.choices.find((choice) => choice.value === value)?.label ?? String(value));
    }
  }
  return changed.length ? changed.join(' · ') : 'Defaults';
}

/**
 * Renders the controls for one codec and direction into `container`.
 * Rebuilds only when the codec or direction changes, so focus and the
 * open/closed state survive ordinary re-renders.
 *
 * @param {HTMLElement} container
 * @param {string} idPrefix
 */
export function createOptionsPanel(container, idPrefix = 'opt') {
  let builtFor = '';

  /**
   * @param {Codec} codec
   * @param {Direction} direction
   * @param {OptionValues} values
   * @returns {boolean} whether there are any options to show
   */
  function render(codec, direction, values) {
    const options = optionsFor(codec, direction);
    const key = `${codec.id}:${direction}`;
    if (key !== builtFor) {
      container.replaceChildren(...options.map((option) => buildControl(option, idPrefix)));
      builtFor = key;
    }

    for (const option of options) {
      const control = /** @type {HTMLInputElement | HTMLSelectElement} */ (
        container.querySelector(`[data-option-id="${option.id}"]`)
      );
      const hint = /** @type {HTMLElement} */ (
        container.querySelector(`#${idPrefix}-${option.id}-hint`)
      );
      const value = values[option.id];
      let hintText;
      if (option.type === 'checkbox') {
        /** @type {HTMLInputElement} */ (control).checked = Boolean(value);
        hintText = option.hint;
      } else {
        control.value = String(value);
        hintText = option.choices.find((choice) => choice.value === value)?.hint;
      }
      hint.textContent = hintText ?? '';
      hint.hidden = !hintText;
    }
    return options.length > 0;
  }

  return { render };
}

/**
 * The option id and new value from a change event inside the panel, or null.
 *
 * @param {Event} event
 * @returns {{ id: string, value: string | boolean } | null}
 */
export function readOptionChange(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const id = target.dataset?.optionId;
  if (!id) return null;
  const value =
    target instanceof HTMLInputElement && target.type === 'checkbox'
      ? target.checked
      : /** @type {HTMLSelectElement} */ (target).value;
  return { id, value };
}
