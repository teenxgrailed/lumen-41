- The phone Every place menu opens with less work on the main thread: the
  shadow pieces carry their drawn shadow directly instead of re-reading it
  through a variable on every frame. Nothing looks different.
