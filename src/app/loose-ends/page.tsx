// The section formerly known as "Loose ends" now lives at /requests.
//
// Kept as a permanent redirect so anything still pointing here — a bookmark,
// an old email link, a revalidatePath I missed — lands in the right place
// instead of 404ing. Cheap to keep, expensive to discover the hard way.

import { redirect } from "next/navigation";

export default function LooseEndsRedirect() {
  redirect("/requests");
}
