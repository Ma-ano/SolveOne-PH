# Phase 12 — Advanced discovery

## Delivered scope

Phase 12 adds deterministic, explainable request matching for five helper
intents: recommended results, skill matching, “I have no money,” nearby help,
and “I have a budget.” The feature uses the existing public request surface
and never creates a payment, offer, reservation, or completion record.

Signed-in helpers may use saved profile skills and general city/province.
Anonymous helpers can supply those filters directly. A signed-in helper's own
requests are removed from personalized results.

## Ranking contract

Discovery is database-ranked with this stable tuple:

1. number of selected skills matching `requiredSkills`;
2. factual verification badge present;
3. urgency and earliest needed-by date;
4. same city, then same province;
5. oldest published request;
6. request ID as the unique tiebreaker.

Budget discovery first filters to financial needs whose complete remaining
money or proportional item value is greater than zero and no more than the
entered amount. Every returned result is therefore fully solvable within that
budget; the remaining tuple begins with verification.

The API returns short factual reasons such as a matched-skill count, factual
badge, urgency, and general-location match. It does not infer a reason from
clicks, popularity, donations, protected traits, health data, precise
coordinates, or private messages. There is no AI or machine-learned ranking.

## Data model

Skill and time need items may now store an optional `estimatedMinutes` value
from 15 through 10,080. It is an estimate for discovery display only; it never
increments verified impact. Money and item needs cannot set this field.

Two compound help-request indexes support the public province and required
skill discovery prefixes. Production keeps Mongoose automatic index creation
off. After backup and review, an operator must run
`npm run db:index:discovery` against the intended database. The job only calls
the reviewed `HelpRequest.createIndexes()` operation and was not run against a
live database during development.

## API surface

| Method | Route                               | Authentication  | Purpose                                                                 |
| ------ | ----------------------------------- | --------------- | ----------------------------------------------------------------------- |
| GET    | `/api/v1/requests/discover`         | Optional bearer | Rank public requests by relevant, skills, no-money, or nearby mode      |
| GET    | `/api/v1/requests/solvable?budget=` | Optional bearer | Find positive remaining financial needs fully solvable within PHP input |

`discover` accepts `mode`, comma-separated `skills`, general `city` and
`province`, `category`, `helpType`, `urgency`, `limit`, and `cursor`.
Skill/no-money modes require explicit or saved skills and consider only skill
or time needs. Nearby mode requires an explicit or saved province.

`solvable` accepts a decimal PHP `budget` with at most two decimal places,
converts it to integer centavos during validation, and also accepts general
location, category, urgency, limit, and cursor filters.

Both responses use the public request DTO plus a `discovery` object containing
matched skills, optional estimated minutes, optional remaining budget,
city/province match level, and factual match reasons. Their opaque cursors bind
the complete ranking tuple and normalized filter/personalization scope.

## Client surface

The responsive `/discover` screen exposes the five helper intents, suggested
skill chips with a custom skill input, optional general location, and a PHP
budget. Result cards show estimated time, fully solvable remaining value, and
why a result matched. Copy on the page states that AI and sensitive personal
traits are not ranking inputs.

## Security and privacy

- Only published or partially solved public requests owned by active accounts
  can appear.
- Public serializers remain authoritative; barangay and private profile data
  never appear in discovery DTOs.
- Saved skills and city/province personalize only the authenticated helper's
  read and are included in the cursor's hashed scope.
- The query schema is strict, bounded, and rejects unrecognized location fields
  such as barangay.
- Remaining budget is calculated from server-held solved and reserved counters;
  a caller cannot submit progress or ranking values.
- No GPS, distance calculation, sensitive-attribute ranking, engagement score,
  AI inference, or automatic decision is introduced.

## Operational notes

No package or lockfile changed in this phase. Discovery aggregation should be
measured with production-like cardinality before launch; the compound indexes
support initial filtering, while exact lowercased skill intersection and the
multi-signal rank are computed in MongoDB. City/province strings are currently
free-form normalized comparisons rather than canonical Philippine geographic
IDs. Estimated time is optional on older requests, and nearby means same city
or province—not physical distance.
