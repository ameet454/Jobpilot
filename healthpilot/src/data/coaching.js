/**
 * What the trainer says during each rep. `lift` plays as the weight goes up
 * (or the muscle shortens), `lower` on the controlled return, and one `tip`
 * is read every few reps. Short on purpose: they must fit inside a rep.
 */
export const CUES = {
  'bench-press': { lift: 'Press! Push through your chest.', lower: 'Slowly down to mid-chest.', tips: ['Elbows at forty-five degrees.', 'Shoulder blades pinched, feet planted.'] },
  'incline-db-press': { lift: 'Press up and in.', lower: 'Lower slowly. Feel the upper chest stretch.', tips: ['Keep the bench around thirty degrees.', 'Do not let the dumbbells drop fast.'] },
  'push-up': { lift: 'Push the floor away!', lower: 'Chest down slowly.', tips: ['Squeeze your glutes, no sagging hips.', 'Elbows angled back, not flared.'] },
  'cable-fly': { lift: 'Hug the tree. Squeeze the chest.', lower: 'Open slowly. Feel the stretch.', tips: ['Keep the elbow bend fixed.', 'Do not press — sweep in an arc.'] },
  dips: { lift: 'Push up! Lock the triceps.', lower: 'Lower to arms parallel.', tips: ['Shoulders down, away from your ears.', 'Lean forward for more chest.'] },
  'lat-pulldown': { lift: 'Elbows down to your ribs!', lower: 'Let it rise slowly. Full stretch.', tips: ['Chest up, lean back slightly.', 'Pull with your back, not your hands.'] },
  'pull-up': { lift: 'Drive the elbows down. Chin over!', lower: 'Lower all the way down.', tips: ['No swinging.', 'Pull the shoulder blades down first.'] },
  'barbell-row': { lift: 'Row to your belly. Squeeze the back.', lower: 'Arms long, slowly.', tips: ['Keep the back flat.', 'Do not stand up as you row.'] },
  'seated-cable-row': { lift: 'Pull! Squeeze the shoulder blades.', lower: 'Reach forward slowly.', tips: ['Sit tall, no rocking.', 'Elbows close to your sides.'] },
  deadlift: { lift: 'Push the floor! Hips through.', lower: 'Hips back first, bar close.', tips: ['Brace your core before every rep.', 'Bar stays against your legs.'] },
  'overhead-press': { lift: 'Press straight up!', lower: 'Back to the shoulders, controlled.', tips: ['Squeeze glutes, no back arch.', 'Head through once the bar passes.'] },
  'lateral-raise': { lift: 'Raise out wide. Lead with elbows.', lower: 'Two seconds down.', tips: ['Stop at shoulder height.', 'No shrugging, no swinging.'] },
  'face-pull': { lift: 'Pull to your forehead. Split the rope.', lower: 'Arms long again, slowly.', tips: ['Elbows high.', 'Squeeze between the shoulder blades.'] },
  'barbell-curl': { lift: 'Curl! Squeeze the biceps.', lower: 'All the way down, slowly.', tips: ['Elbows pinned to your sides.', 'No hip swing.'] },
  'hammer-curl': { lift: 'Curl up, thumbs on top.', lower: 'Slowly down.', tips: ['Elbows still.', 'Feel the outer arm and forearm.'] },
  'triceps-pushdown': { lift: 'Push down! Lock out.', lower: 'Let it rise, elbows stay.', tips: ['Elbows tucked at your sides.', 'Do not lean over the bar.'] },
  'overhead-triceps': { lift: 'Straighten the arms. Squeeze.', lower: 'Lower behind your head.', tips: ['Elbows point forward.', 'Keep your ribs down.'] },
  'back-squat': { lift: 'Drive up! Push the floor.', lower: 'Sit down between your heels.', tips: ['Knees follow your toes.', 'Chest up, brace hard.'] },
  'leg-press': { lift: 'Press through the whole foot.', lower: 'Knees towards chest, slowly.', tips: ['Lower back stays on the pad.', 'Do not lock the knees hard.'] },
  'romanian-deadlift': { lift: 'Hips forward! Squeeze the glutes.', lower: 'Hips back. Feel the hamstrings stretch.', tips: ['Soft knees, flat back.', 'Bar slides down your thighs.'] },
  'walking-lunge': { lift: 'Push through the front heel!', lower: 'Back knee down, slowly.', tips: ['Long step.', 'Torso tall.'] },
  'leg-curl': { lift: 'Heels to your bum! Squeeze.', lower: 'Lower slowly.', tips: ['Hips pressed into the pad.', 'No kicking.'] },
  'leg-extension': { lift: 'Straighten! Squeeze the thighs.', lower: 'Lower under control.', tips: ['Knees in line with the pivot.', 'Stay seated.'] },
  'calf-raise': { lift: 'Up on your toes! Hold.', lower: 'Heels down. Deep stretch.', tips: ['No bouncing.', 'Knees straight.'] },
  'hip-thrust': { lift: 'Hips up! Squeeze the glutes hard.', lower: 'Lower slowly.', tips: ['Chin tucked.', 'Shins vertical at the top.'] },
  plank: { lift: 'Hold. Squeeze abs and glutes.', lower: 'Keep breathing. Stay long.', tips: ['Hips level, do not sag.', 'Pull the belly button in.'] },
  'hanging-leg-raise': { lift: 'Curl the pelvis up!', lower: 'Lower slowly, no swing.', tips: ['Brace the abs before you lift.', 'Control every inch.'] },
  crunch: { lift: 'Ribs to hips! Squeeze.', lower: 'Lower slowly.', tips: ['Do not pull your neck.', 'Breathe out as you curl.'] },
};

export function cuesFor(ex) {
  return CUES[ex.id] || { lift: 'Lift — feel the red muscle work.', lower: 'Lower slowly, keep tension.', tips: ex.mistakes.map((m) => `Avoid: ${m}.`) };
}
