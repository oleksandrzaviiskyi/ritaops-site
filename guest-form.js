/** Shared guest / edit-guest form helpers */
;(function () {
  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10)
  }

  function flightTemplate(f = {}, key = uid()) {
    return `
      <div class="repeat-block" data-key="${key}" data-kind="flight">
        <button type="button" class="remove">Remove</button>
        <label>Direction</label>
        <select data-field="direction">
          <option value="arrival" ${f.direction === 'arrival' ? 'selected' : ''}>Arrival</option>
          <option value="departure" ${f.direction === 'departure' ? 'selected' : ''}>Departure</option>
        </select>
        <div class="grid2">
          <div><label>Flight number</label><input data-field="flightNumber" value="${escapeAttr(f.flightNumber)}" /></div>
          <div><label>Date</label><input data-field="date" type="date" value="${escapeAttr(f.date)}" /></div>
        </div>
        <div class="grid2">
          <div><label>Time</label><input data-field="time" value="${escapeAttr(f.time)}" /></div>
          <div><label>Airport</label>
            <select data-field="airport">
              <option value="">—</option>
              <option value="POP" ${f.airport === 'POP' ? 'selected' : ''}>POP</option>
              <option value="PUJ" ${f.airport === 'PUJ' ? 'selected' : ''}>PUJ</option>
              <option value="SDQ" ${f.airport === 'SDQ' ? 'selected' : ''}>SDQ</option>
            </select>
          </div>
        </div>
        <label>Passengers</label><input data-field="passengers" type="number" min="0" value="${f.passengers ?? ''}" />
      </div>`
  }

  function dietaryTemplate(d = {}, key = uid()) {
    return `
      <div class="repeat-block" data-key="${key}" data-kind="dietary">
        <button type="button" class="remove">Remove</button>
        <label>Guest name (if not you)</label><input data-field="guestName" value="${escapeAttr(d.guestName)}" />
        <label>Restriction</label>
        <select data-field="restriction">
          <option value="vegetarian" ${d.restriction === 'vegetarian' ? 'selected' : ''}>Vegetarian</option>
          <option value="vegan" ${d.restriction === 'vegan' ? 'selected' : ''}>Vegan</option>
          <option value="gluten_free" ${d.restriction === 'gluten_free' ? 'selected' : ''}>Gluten-free</option>
          <option value="lactose_free" ${d.restriction === 'lactose_free' ? 'selected' : ''}>Lactose-free</option>
          <option value="allergy" ${d.restriction === 'allergy' ? 'selected' : ''}>Allergy</option>
          <option value="halal" ${d.restriction === 'halal' ? 'selected' : ''}>Halal</option>
          <option value="other" ${d.restriction === 'other' ? 'selected' : ''}>Other</option>
        </select>
        <label>Details</label><input data-field="details" value="${escapeAttr(d.details)}" />
      </div>`
  }

  function activityTemplate(a = {}, key = uid()) {
    return `
      <div class="repeat-block" data-key="${key}" data-kind="activity">
        <button type="button" class="remove">Remove</button>
        <label>Activity</label>
        <select data-field="activity">
          <option value="gri_gri" ${a.activity === 'gri_gri' ? 'selected' : ''}>Laguna Gri Gri</option>
          <option value="playa_grande" ${a.activity === 'playa_grande' ? 'selected' : ''}>Playa Grande</option>
          <option value="kite_surfing" ${a.activity === 'kite_surfing' ? 'selected' : ''}>Kite Surfing</option>
          <option value="horse_riding" ${a.activity === 'horse_riding' ? 'selected' : ''}>Horse Riding</option>
          <option value="cultural_tour" ${a.activity === 'cultural_tour' ? 'selected' : ''}>Cultural Tour</option>
          <option value="yoga" ${a.activity === 'yoga' ? 'selected' : ''}>Yoga</option>
          <option value="massage" ${a.activity === 'massage' ? 'selected' : ''}>Massage</option>
          <option value="other" ${a.activity === 'other' ? 'selected' : ''}>Other</option>
        </select>
        <p class="activity-hint activity-hint-massage" ${a.activity === 'massage' ? '' : 'hidden'}>💆 Massage · 60 min · $60 USD per person</p>
        <label>Date</label><input data-field="date" type="date" value="${escapeAttr(a.date)}" />
        <label>Participants</label><input data-field="guests" type="number" min="0" value="${a.guests ?? ''}" />
        <label>Notes</label><input data-field="notes" value="${escapeAttr(a.notes)}" />
      </div>`
  }

  function syncMassageHints(root) {
    const scope = root || document
    scope.querySelectorAll('.repeat-block[data-kind="activity"]').forEach((block) => {
      const select = block.querySelector('[data-field="activity"]')
      const hint = block.querySelector('.activity-hint-massage')
      if (select && hint) hint.hidden = select.value !== 'massage'
    })
  }

  function collectRepeats(containerId, kind) {
    const items = []
    document.querySelectorAll(`#${containerId} .repeat-block[data-kind="${kind}"]`).forEach((el) => {
      const row = {_key: el.dataset.key}
      el.querySelectorAll('[data-field]').forEach((input) => {
        const name = input.dataset.field
        let val = input.type === 'checkbox' ? input.checked : input.value
        if (input.type === 'number' && val !== '') val = Number(val)
        if (val !== '' && val != null) row[name] = val
      })
      items.push(row)
    })
    return items
  }

  function fillList(containerId, kind, items, templateFn) {
    const el = document.getElementById(containerId)
    if (!el) return
    el.innerHTML = ''
    const list = Array.isArray(items) ? items : []
    list.forEach((item) => {
      el.insertAdjacentHTML('beforeend', templateFn(item, item._key || uid()))
    })
    syncMassageHints(el)
  }

  function bindRepeatUi() {
    document.getElementById('addFlight')?.addEventListener('click', () => {
      document.getElementById('flightsList').insertAdjacentHTML('beforeend', flightTemplate())
    })
    document.getElementById('addDietary')?.addEventListener('click', () => {
      document.getElementById('dietaryList').insertAdjacentHTML('beforeend', dietaryTemplate())
    })
    document.getElementById('addActivity')?.addEventListener('click', () => {
      const list = document.getElementById('activitiesList')
      list.insertAdjacentHTML('beforeend', activityTemplate())
      syncMassageHints(list)
    })
    document.body.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) {
        e.target.closest('.repeat-block')?.remove()
      }
    })
    document.getElementById('activitiesList')?.addEventListener('change', (e) => {
      if (!e.target.matches('[data-field="activity"]')) return
      const hint = e.target.closest('.repeat-block')?.querySelector('.activity-hint-massage')
      if (hint) hint.hidden = e.target.value !== 'massage'
    })
  }

  function readContactFields(form) {
    const firstName = form.firstName.value.trim()
    const lastName = form.lastName.value.trim()
    const email = form.email.value.trim()
    const phone = form.phone.value.trim()
    const guestName = [firstName, lastName].filter(Boolean).join(' ')
    return {firstName, lastName, email, phone, guestName}
  }

  function buildSubmissionPayload(form, extra = {}) {
    const contact = readContactFields(form)
    return {
      ...extra,
      ...contact,
      adults: form.adults.value ? Number(form.adults.value) : null,
      children: form.children.value ? Number(form.children.value) : 0,
      massageRequested: form.massageRequested.checked,
      specialRequests: form.specialRequests.value || null,
      flights: collectRepeats('flightsList', 'flight'),
      dietaryRestrictions: collectRepeats('dietaryList', 'dietary'),
      activities: collectRepeats('activitiesList', 'activity')
    }
  }

  function fillContactFields(form, data) {
    if (!data) return
    let first = data.firstName || ''
    let last = data.lastName || ''
    if (!first && !last && data.guestName) {
      const parts = String(data.guestName).trim().split(/\s+/)
      first = parts[0] || ''
      last = parts.slice(1).join(' ') || ''
    }
    form.firstName.value = first
    form.lastName.value = last
    form.email.value = data.email || ''
    form.phone.value = data.phone || ''
    form.adults.value = data.adults != null ? data.adults : 1
    form.children.value = data.children != null ? data.children : 0
    form.massageRequested.checked = Boolean(data.massageRequested)
    form.specialRequests.value = data.specialRequests || ''
    fillList('flightsList', 'flight', data.flights, flightTemplate)
    fillList('dietaryList', 'dietary', data.dietaryRestrictions, dietaryTemplate)
    fillList('activitiesList', 'activity', data.activities, activityTemplate)
  }

  window.GuestForm = {
    escapeAttr,
    uid,
    flightTemplate,
    dietaryTemplate,
    activityTemplate,
    syncMassageHints,
    collectRepeats,
    fillList,
    bindRepeatUi,
    readContactFields,
    buildSubmissionPayload,
    fillContactFields
  }
})()
