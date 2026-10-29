# NETRA EvidenceAI Synthetic Demo Pack

All files in this folder are synthetic prototype evidence. The version 2 pack
uses official-schema synthetic case `104060011202600001` (CaseMaster ID `13`)
as its common narrative.

| File | EvidenceAI workflow | Expected result |
| --- | --- | --- |
| `fir-104060011202600001-v2.png` | OCR > Load FIR scan | Detect FIR number and resolve the full Cloud Scale case bundle automatically |
| `vehicle-ka03ab7161-v2.png` | Vehicle stop > Load vehicle demo | Read `KA03AB7161` and attach it to the preselected Vehicle Theft FIR |
| `crowd-watch-ganesh-nayak-v2.png` | Crowd watch > Load crowd demo | Detect faces and compare against registered fictional profile 15; return records only if Zia actually reports a match |
| `watchlist-ganesh-nayak-v2.png` | Legacy standalone comparison reference | Older generated portrait, distinct from registered profile 15; does not establish a database identity |

Crowd and comparison demo loading uses `/synthetic-profiles/profile-000015.webp`
as its registered reference. No match is forced. Original PNGs in
`test-assets/evidence-ai/criminal-profiles` and public registered WebPs resolve
their own profile automatically without selecting a name. Screenshots and
edited files are unregistered and receive no inferred record linkage.

The source ER schema does not contain a vehicle-registration entity. Therefore
the plate workflow records the image as new evidence against an officer-selected
official CaseMaster row; it does not claim a pre-existing vehicle-registry hit.
