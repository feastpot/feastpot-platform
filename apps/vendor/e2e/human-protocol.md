# Vendor portal usability test protocol
## Delivery settings and profile pages

**Conducted by:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
**Participant:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
**Date:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  
**Session length:** Allow 60 minutes

---

## Briefing (read aloud, do not improvise)

> Thank you for taking part. We are testing the software, not you -- there are
> no wrong answers. Please think aloud as you go: say what you are looking at,
> what you expect to happen, and anything that surprises you. I will not help
> you during a task, but I may ask questions afterwards. You can stop at any
> time.

Hand the participant a device with the vendor portal open on the Delivery
settings page and the Profile settings page (one per task set). Do **not**
point to any control or name any feature.

---

## Task set A -- Delivery settings

### A1

> "Set things up so that people in Camberwell can order from you."

- **Target:** complete, unaided, within 60 seconds
- **Pass:** completed without any verbal prompt, within 60 seconds
- **Failure modes to note:** participant does not find the radius control;
  participant confuses "Delivery fee" with "service area"; participant saves
  without postcodes present and does not notice the warning

| Observation | Notes |
|---|---|
| Completed unaided (yes / no) | |
| Time (seconds) | |
| Hesitations (describe each) | |
| Verbatim comments | |
| Pass / Fail | |

---

### A2

> "Make sure that orders under £15 cannot go through, and that anyone ordering
> more than £40 gets free delivery."

- **Target:** complete, unaided, within 90 seconds
- **Pass:** completed without any verbal prompt, within 90 seconds, with both
  rules correct
- **Failure modes to note:** participant enters the free delivery threshold
  below the minimum and does not read the inline error; participant saves
  without fixing the conflict

| Observation | Notes |
|---|---|
| Completed unaided (yes / no) | |
| Time (seconds) | |
| Hesitations (describe each) | |
| Verbatim comments | |
| Pass / Fail | |

---

### A3

> "You have decided to also let customers collect their orders in person.
> Set that up with your kitchen address."

- **Target:** complete, unaided, within 2 minutes
- **Pass:** completed without any verbal prompt, within 2 minutes, with a
  collection address entered and saved
- **Failure modes to note:** participant cannot find how to enable collection;
  participant saves without the address fields; participant mistakes the
  Collection checkbox for a cosmetic toggle

| Observation | Notes |
|---|---|
| Completed unaided (yes / no) | |
| Time (seconds) | |
| Hesitations (describe each) | |
| Verbatim comments | |
| Pass / Fail | |

---

## Task set B -- Profile settings

### B1

> "Fill in your profile so it is ready for customers to find you."

- **Target:** complete, unaided, within 4 minutes. The completeness list must
  be gone from the screen before the participant declares done.
- **Pass:** completeness list cleared, completed without any verbal prompt,
  within 4 minutes
- **Failure modes to note:** participant does not notice the completeness list
  at the top; participant misses the featured dishes section because they
  have no live menu items yet; participant navigates away to add menu items
  (counts as a navigation, note it)

| Observation | Notes |
|---|---|
| Completed unaided (yes / no) | |
| Time (seconds) | |
| Number of page navigations (target: 0) | |
| Hesitations (describe each) | |
| Verbatim comments | |
| Pass / Fail | |

---

### B2

> "Let customers know that your kitchen is especially known for jollof rice and
> puff puff."

- **Target:** complete, unaided, within 90 seconds
- **Pass:** both items appear as separate chips in Specialities, saved,
  without any verbal prompt, within 90 seconds
- **Failure modes to note:** participant types both values in one field as a
  comma-separated string; participant puts them in Cuisines instead of
  Specialities; participant does not save

| Observation | Notes |
|---|---|
| Completed unaided (yes / no) | |
| Time (seconds) | |
| Hesitations (describe each) | |
| Verbatim comments | |
| Pass / Fail | |

---

### B3

> "Change your web address to 'brixton-suya-house'. Make sure you understand
> what that means for anything you have already shared or printed."

- **Target:** complete, unaided, within 3 minutes
- **Pass:** slug changed and saved, participant read and could paraphrase the
  QR code warning, completed without any verbal prompt, within 3 minutes
- **Failure modes to note:** participant changes the slug without reading the
  warning; participant cancels because the warning frightens them without
  understanding that old links still work; participant cannot find the slug
  field because it is read-only by default

| Observation | Notes |
|---|---|
| Completed unaided (yes / no) | |
| Time (seconds) | |
| Read the warning before saving (yes / no) | |
| Hesitations (describe each) | |
| Verbatim comments | |
| Pass / Fail | |

---

## Comprehension questions (screen hidden)

After all tasks are complete, turn the screen away or close the lid. Ask these
questions without showing the interface. Record answers verbatim.

### Q1

> "Which postcodes can order from you right now, and how do you know?"

**Expected (any form):** participant names the districts they saved, or says
they can see a list, or mentions the radius. A participant who cannot recall
any specific postcode district and cannot describe how they would find out
does **not** pass.

| Answer (verbatim) | Pass / Fail |
|---|---|
| | |

---

### Q2

> "What is the difference between your specialities and your featured dishes?"

**Expected (any form):** specialities are things the kitchen is known for or
good at (free text, searchable); featured dishes are actual items from the
menu shown at the top of the public page. A participant who conflates the two
or says they are the same does **not** pass.

| Answer (verbatim) | Pass / Fail |
|---|---|
| | |

---

### Q3

> "If you changed your web address, what would happen to the QR code you
> printed last month?"

**Expected (any form):** old links still work (redirect), but the QR code
would go through a redirect step / show the old address first, so printing a
new one is advisable. A participant who says the old QR code would simply
break does **not** pass. A participant who says nothing would change also does
**not** pass.

| Answer (verbatim) | Pass / Fail |
|---|---|
| | |

---

## Results summary

### Task report

| Task | Target | Actual time | Completed unaided | Pass / Fail |
|------|--------|-------------|-------------------|-------------|
| A1: Camberwell service area | 60 s | | | |
| A2: Minimum order and free delivery | 90 s | | | |
| A3: Collection pickup | 2 min | | | |
| B1: Complete profile (zero navigations) | 4 min | | | |
| B2: Add specialities | 90 s | | | |
| B3: Change URL slug | 3 min | | | |
| Q1: Postcode recall | -- | -- | -- | |
| Q2: Specialities vs featured dishes | -- | -- | -- | |
| Q3: QR code consequence | -- | -- | -- | |

### Controls with no observable effect

List every control the participant interacted with where nothing changed on
screen or in the saved state. A blank table means all controls behaved as
labelled.

| Control | Expected effect | Observed effect |
|---------|----------------|-----------------|
| | | |

### Debrief notes

Record any freeform comments, confusion points, or suggested improvements
raised by the participant after the tasks.

> \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
