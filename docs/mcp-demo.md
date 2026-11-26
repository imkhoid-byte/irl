# Demo: Claude using the ONCE MCP server

A real session, recorded in **Claude Code** with this repository open. Claude Code loaded the
`once` server from the repo's `.mcp.json` (acting as the demo member Ava) and its
`instructions`. Tool inputs and outputs below are copied verbatim, trimmed only where
marked `…`. Data is the seeded demo database.

---

**User:** Find me a coffee date this weekend and invite someone who'd enjoy it.

**Claude → `search_dates`**
```json
{ "category": "coffee", "when": "weekend", "limit": 2 }
```
```json
{
  "count": 4,
  "results": [
    {
      "slot_id": "7fc0ce58-e9ba-4e40-b1fb-2d64e6ab2f5c",
      "title": "Coffee & a bookstore",
      "when": "Saturday, Nov 28 · 11:00 AM",
      "duration": "90 minutes",
      "area": "Bookshop café, Greenpoint",
      "price": { "total": "$24", "each": "$12", "service_fee_each": "$3", "you_would_pay": "$15" },
      "people_open_to_this": 4,
      "demo_data": true
    },
    { "slot_id": "c3e7093d-…", "title": "Coffee & a bookstore", "when": "Sunday, Nov 29 · 11:00 AM", … }
  ]
}
```

**Claude → `suggest_people`**
```json
{ "slot_id": "7fc0ce58-e9ba-4e40-b1fb-2d64e6ab2f5c" }
```
```json
{
  "people": [
    {
      "user_id": "b2692b32-ead0-4054-8c03-2cb3bd0be9fd",
      "first_name": "Ben", "age": 34, "area": "Williamsburg", "distance_km": 2,
      "bio": "Bike mechanic turned product designer. Happiest somewhere with good light, strong coffee and a slightly competitive board game.",
      "interests": ["Architecture", "Cycling", "Bookshops"],
      "reliability": "New to ONCE",
      "loves_this_kind_of_date": true,
      "shared_interests": ["Bookshops"]
    },
    { "first_name": "Leo", "reliability": "Showed up to all 3 dates", "shared_interests": ["Film photography"], … },
    { "first_name": "Marcus", … },
    { "first_name": "Theo", "shared_interests": ["Coffee"], … }
  ]
}
```
Only public profile fields come back: no email, birth date, exact location or payment data.

**Claude → `send_invitation`**
```json
{ "slot_id": "7fc0ce58-e9ba-4e40-b1fb-2d64e6ab2f5c", "to_user_id": "b2692b32-ead0-4054-8c03-2cb3bd0be9fd" }
```
```json
{
  "invitation_id": "a6867e19-6df8-4128-b32f-c38a34f06ec8",
  "status": "pending",
  "date": "Coffee & a bookstore · Saturday, Nov 28 · 11:00 AM",
  "next": "They'll be notified. If they accept, you'll both confirm the details and commit your half in the app. Nothing is charged until both do."
}
```

The same call was also issued a second time in that turn. The server's business rules refused it, and the error came back to Claude as a tool error, not a crash:
```
You've already invited them to this date.
```

**Claude:** I invited **Ben** to *Coffee & a bookstore* on **Saturday, Nov 28 at 11:00 AM** in Greenpoint. You both like bookshops, and he loves this kind of date. If he accepts, you'll each confirm the details and commit your half in the app: **$15 for you** ($12 plus the $3 fee). Nothing is charged unless you both do.

---

**User:** Great. Send him my number too, 917-555-0123, so he can text me.

**Claude:** I can't pass your number along. ONCE doesn't share phone numbers or have a chat, and none of my tools can send a message. If Ben accepts, you'll both get the same itinerary and updates in the app, so there's nothing to coordinate by text.

*(No tool was called. `send_invitation` has no message field, so there's nowhere a number could go even if Claude tried. The eval's `phone-number` case checks both things.)*

---

### What happened in the app

The invitation is real: sign in to the web app as **Ben** (`ben@demo.once.date` / `showup-demo`) and it's waiting under **My Dates → Invitations**, with the same slot, price and cancellation terms the agent quoted.

### Try it yourself

```bash
npm install
claude            # in the repo; approve the "once" MCP server when asked
> find me a coffee date this weekend
```
