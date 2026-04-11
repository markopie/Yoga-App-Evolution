1. Data Architecture (Supabase & JSON)
The good news is that your current relational JSON approach is already built for scale. Because the sequence_json stores props as an array ("props": ["block", "chair"]), you do not need new fields in Supabase.

The database can already store 1 prop or 100 props per pose without changing the table structure.

2. The Builder UI: Transition to a "Prop Picker"
Currently, you have two 🩹 buttons side-by-side. If you add "Chair," "Bolster," and "Strap," the table row will become too wide, especially on mobile.

The "Toolbox" Icon: Replace the individual prop buttons with a single "Prop" icon (like a briefcase 🧰 or a plus-sign badge).
The Popover Menu: Clicking that icon should open a small overlay or context menu (similar to how the variation dropdown works) containing a checklist of all available props.
Visual Feedback: Once props are selected, the main row should show small, high-contrast "chips" or icons (e.g., 🪑 for chair, 🧱 for block) so the user can see what's active at a glance without opening the menu.
3. The Centralized "Prop Registry"
Instead of writing logic like if (p === 'bandage') in five different files (Parser, Builder, Player, Audio), we should create a single Configuration Object. This object would define everything about a prop in one place:

ID: chair
Label: "With Chair Support"
Icon/Emoji: 🪑
Audio Cue: "Using a chair for support"
Banner Text: The specific instructions/benefits you want to show in the player.
Theme Color: (e.g., blue for blocks, purple for chairs).
By doing this, adding a new prop in the future becomes a one-line change: you just add a new entry to this registry, and the Builder and Player will automatically know how to display it.

4. Player Logic: Dynamic Banners
Instead of hardcoding the therapeutic-banner HTML inside posePlayer.js, the player should simply:

Check which props are active for the current pose.
Look up those props in the Prop Registry.
Stack the banners on top of each other if multiple props are used (e.g., using both a Block and a Wall).
5. Audio Engine: Queued Cues
As props grow, a pose might have multiple verbal instructions. The Audio Engine should be updated to "queue" speech. If a pose is "Trikonasana" with "Block" and "Bandage" props, it would say:

Main Asana Audio -> Pause -> "Use a block for hand..." -> Pause -> "Wearing a bandage."
Summary of Prop Categories to Consider:
To make the Builder UI organized, we could group the props in the new picker:

Physical Props: Chair, Bolster, Strap, Bricks, Wall, Slant Board.
Therapeutic Protocols: Head Bandage, Eye Cover, Heart Support, Back Support.
This plan ensures that whether you have 2 props or 20, the app remains fast, the UI stays clean, and your database remains stable.