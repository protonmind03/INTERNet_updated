# PSU marks: what is here, what is missing, what to fix

Checked against the system's own college and program list: migration `038_seed_psu_lingayen.sql`, plus the formal names in `068`.

## Wrong file: replace before going live

| File | Problem |
|---|---|
| `ECOSOC-AB_Economics-CASL.jpg` (AB Economics) | The ring text reads **"PALAWAN STATE UNIVERSITY"**, not Pangasinan. This is another school's Economics Society logo. Get PSU Lingayen ECOSOC's real logo. Until then, the app shows the ABEcon monogram instead (this mark's `mark_key` is seeded but should be cleared if the logo is not replaced). |

## Missing

| What | For | Status |
|---|---|---|
| **CBPA college seal** | College of Business and Public Administration | **Missing.** The two CBPA program logos (JBMA, YPAG) are here; the college seal is not. The coordinator crest falls back to a "CBPA" monogram. |
| BSEd program-level organisation | Bachelor of Secondary Education as a whole | Not in the zip. Only the majors' organisations are (AFET English, KAMFIL Filipino, EC Science, KMAP Social Studies). A BSEd student with no major set shows the CTE seal. |
| BSEd Mathematics major organisation | If CTE offers BSEd Math at Lingayen | Not in the zip. Confirm whether the major exists. |
| BS Tourism Management program and organisation | CHTM | The logo calls the college "College of Tourism & Hospitality Management", but the system only has BS Hospitality Management. Confirm whether a Tourism program exists at Lingayen; if so, its organisation logo is missing. |
| BSBA major organisations | Financial Management, Operations Management | Not in the zip. JBMA covers BSBA as a whole, which is fine unless the majors have their own groups. |
| BIT major organisations | Automotive, Ceramics, Civil, Drafting, Electrical, Electronics, Food Service Management, Garments, Mechanical | Not in the zip. AITS covers BIT as a whole. |
| BS Math major organisations | Pure Mathematics, Statistics, CIT | Not in the zip. Math Circle covers the program. |

## Names to confirm with the OJT office

| Item | Logo says | System says |
|---|---|---|
| Hospitality college | College of **Tourism and Hospitality** Management (CTHM) | College of **Hospitality and Tourism** Management (CHTM) |
| BTVTEd organisation | "ATTES" on the seal | file named "ATVTES" |
| BSEd Filipino file | "SEd_Major_in_Filipino" | BSEd, Filipino major |
| EC (BSEd Science) | "Environmentalists" only, with no PSU or Lingayen text | assumed to be the BSEd Science organisation |
| KMAP (BSEd Social Studies) | shield on an orange background | full name of the organisation unknown |

## Quality notes

- These came as JPGs with backgrounds. They were cut to clean circles for the web, but a transparent PNG or SVG from each organisation would be sharper:
  - CLICS (black), MC (orange), SFITI (blue), YPAG (orange), ECOSOC (black)
- AFET (317 px) and FNDC (552 px) are low-resolution. They look fine at 128 px but soft at large sizes.
- These are not round and are kept whole on white:
  - CTHM (a wide wordmark)
  - LG (a badge with a ribbon)
  - FRHC
  - EC
  - KMAP

  Transparent versions would let them sit on coloured backgrounds.
- The PSU seal (`PSU.png`, 447 px) is usable. A larger or vector version would be better for the printed Time Record.
