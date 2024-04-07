Example taken from https://docs.pears.com/how-tos/share-append-only-databases-with-hyperbee
Idea: slowly build up a simple version of the social app in a single file and then backport once we have a working version to the actual app.
At this stage only starting with basic example and writing down todos of next steps.

e.g. to allow me, the device owner, to get replications to my other core
But on my other device I should be able to both read and write.
TODO: So it should be an Autobase and when I, the device owner, connect to the private core topic, I should be added as a writer.

e.g. to allow my friends to get replications to my public core
But on my other device I should be able to both read and write.
TODO: So it should be an Autobase and when I, the device owner, connect to the public core topic, I should be added as a writer.
But on my friends devices, they should only be able to read.
TODO: So I need to be able to distinguish between myself the device owner and my friends.
TODO: I can store my user info in the private core, which is replicated to my other device
it will need to login via a url such as:
mneme:2d5c1b5f2d5c1b5f2d5c1b5f2d5c1b5f2d5c1b6f
e.g. mneme:<private core local public key>

LOGIN HANDSHAKE:

1.  get some info to device B out-of-band, similar to keet invites (this can be via QR or just messaging a string over)
2.  use that info to establish a connection to the peer (eg. derive a discoveryKey and use hyperswarm, or the primary device could run a hyperdht server and pass the key directly)
3.  do your handshake protocol over the connection where you exchange the bootstrap and the writer key
4.  then at the end the primary device adds the writer to the autobase.

TODO: I can also store my public core key in the private core, which will allow me to setup a new writable public core on my other device.
TODO: So for public core, I need to:

1.  When key found in my private core, instantiate it with the key.
2.  When key NOT found in my private core, instantiate it with the name to generate the key AND store it in the private core!

For my friends, they should only be able to read the public core.
So if I'm the device owner, I should store the list of friends in the private core
Note: A friend is someone who has the public core key and has joined the swarm with it.
They should get replications of my public core but only as a friend's public core.
e.g. I need to setup a public core for each of my friends to replicate to but it can't be the same swarm so I need a separate swarm for each friend.

So I don't need to pass the public core key as an argument. I can just get it from the private core.
But I do need to allow a friend to pass in my public core key as an argument so they can join the swarm with it.
So the 2nd argument needs to be the public core key previously shared with a friend and now they, on their device, want to accept my friend invite (e.g. sharing my public core ) which basically means they join the swarm with the public core's key as the topic.
So I need to setup both a non-personal public core (e.g. I'm the friend and I'm receiving replications from my friends public core)
AND a new non-personal swarm for each friend that joins the public core topic to enable replications from them.
const publicCoreKey = Pear.config.args[1];

If no key, I am the writer e.g. I can write to my core/autobase: Write stuff
Actions:

1.  Read my public core key from the private core
2.  If not present, generate a new public core key and store it in the private core
3.  Read any friends from the private core
4.  For each friend, create a new friend core (readonly e.g. using their public core's key so maybe identify friends via their public core's key) and swarm (both as the server and the client)
5.  As the server, announce ourselves to the swarm.
6.  On each swarm connection, replicate my own public core to the friend
7.  On each friend core update, send an internal event to indicate the friend has updated their core
8.  React to the internal event somehow

If key is present, we are the other device e.g. the reader so read the data
But I'm only the reader of the other device's core. I have my own private/personal cores which should be autobases multiwriter.

TODO: Here, I'd need to add the addWriter command to the private autobase to ask my other device to allow this device to write to it.
e.g. so apply of autobase should listen for addWriter events and add the writer to the core.
Same thing for my personal public core/autobase.

Before initializing the public core, we need to read the public core key from the private core
const publicAutoBee = new Autobee({ store: publicStore, coreName: "public" }, publicCorePublicKey, {
apply: async (batch, view, base) => {
await Autobee.apply(batch, view, base);
// Add own stuff here...
},
})
// Print any errors from apply() etc
.on("error", console.error);

wait till all the properties of the hypercore are initialized
await publicAutoBee.update();

If key is not present, we are the writer so announce ourselves to the swarm
