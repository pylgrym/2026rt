# msglog queue design.

we need to rebuild/refactor how the message log works.

It must work the following way:

When msg is called, the actual message must be added to a container in a new MsgQeueue class,
instead of being displayed.

The actual displaying of the msgqueue contents
should only be  handled by an async ShowQueuedMessages() function called,
after the player and all the NPCs have  taken their turns (which is what have populated the msg queue).

the ShowQueuedMessages()
should work like this:

 - if there are 1 or 0 queued messages, it should 
 return immediately.
 as long as there are 2 or more queued messages,
 it should display them one at a time,
 and wait for any key press.
 It should render them with this prefix:

 (n)message-goes-here

 Where the number in parentheses is the number of still queued messages left.
 Thus, if the queue has 2 elements, and we are displaying the first of those, n should be 1 (because we have 1 message left to show).

 This display-waitkey loop should of course pop/remove the message it has shown,
 so the method ends up removing all but the last remaining message.

That last message will instead be shown as part of the normal display render.
That is, when rendering the normal viewport display,
any final queued message should be rendered. (without n number of course).

For all this to work, we need to be very careful about how we handle the clearing of the queue.

Once we reach the place in code where we are waiting to accept player's next keyboard command, we must clear the queue:
AFTER the final redraw of viewport, but BEFORE we begin waiting for keyboard commands.
  This is a tricky thing to design correctly.
One approach might be the following:

- at the queue-clearing (of the final queued message), instead of simply clearing the queue, we actually transfer that final text to a separate buffer string called 'finalDisplayMessage' (also a field on the MsgQueue, but not its queue-container).
- then, in the viewport rendering for last message, we render sourced from finalDisplayMessage instead, NOT from the collection (which at this point is empty).
- THEN, once player has completed a deliberate turn choice (he might have false starts, inputting commands that are rejected), at THAT point we can also finally clear finalDisplayMessage.
  The purpose of such a convoluted design, is to allow us to redraw the entire viewport multiple times (each time including finalDisplayMessage), without getting strange edge cases about when the queue collection was cleared.

Please think carefully and come up with a consistent and precise robust design for this mechanism which you document to msgqueue-design.md,
then implement that plan.  
