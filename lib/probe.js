const raw = require('raw-socket');
const dns = require('dns');

const icmpSocket = raw.createSocket({ protocol: raw.Protocol.ICMP });

var reqs = [];
var nextId = 1;

function generateId() {
	var startId = nextId++;
	while (true) {
		if (nextId > 65535)
			nextId = 1;
		if (reqs[nextId]) {
			nextId++;
		} else {
			return nextId;
		}

		if (nextId == startId) {
			console.log('no request ids')
			return;
		}
	}
}

function checksum(array) {
	var buffer = Buffer.from(array);
	var sum = 0;
	for (var i=0; i<buffer.length; i=i+2) {
	sum += buffer.readUIntLE(i, 2);
	}
	sum = (sum >> 16) + (sum & 0xFFFF);
	sum += (sum >> 16);
	sum = ~sum;
	//return unsigned
	return (new Uint16Array([sum]))[0];
}

const ECHOMessageType = {
	[0]: 'REPLY',
	[3]: 'DESTINATION_UNREACHABLE',
	[4]: 'SOURCE_QUENCH',
	[5]: 'REDIRECT',
	[11]: 'TimeExceededError',
};

icmpSocket.on('message', async function (buffer, ip) {
	var ip_icmp_offset = 20;
	var type = buffer.readUInt8(ip_icmp_offset);
	var code = buffer.readUInt8(ip_icmp_offset+1);

	var offset = ip_icmp_offset;
	var msg = ECHOMessageType[type];

	if (type == 11) {
		var ip_icmp_ip_offset = ip_icmp_offset + 8;
		var ip_icmp_ip_length = (buffer[ip_icmp_ip_offset] & 0x0f) * 4;
		// console.log('buffer length', buffer.length);//96
		// console.log('ip_icmp_ip_length', ip_icmp_ip_length);// 20
		offset = ip_icmp_ip_offset + ip_icmp_ip_length;
	}
	var sessionId = buffer.readUInt16BE (offset + 4)
	var reqId = buffer.readUInt16BE (offset + 6);
	if (SESSION_ID !== sessionId) return;

	var addr = ip;
	try {
		addr = await dns_reverse(ip);
		addr = addr[0]
		// console.log('dns', addr);
	} catch (e) {
		// console.log('no dns', e);
	}

	var r = reqs[reqId];
	reqs[reqId] = null;
	if (r) {
		const {
			cb,
			ttl,
			dest
		} = r;
		cb && cb({ ip, addr, dest, ttl, sessionId, type, msg });
	}

	return;
});

function pong(ans) {
	console.log('PONG', ans);
}

function traceRoute(dest, hops) {
	hops = hops || 16;
	var i = 1;
	while (i <= hops) {
		// TODO send more probes?
		// for (let j =0; j < 3; j++)
		sendPing(dest, i, (ans) => {
			results.push(ans);
			printRoutes();
		})
		i++;
	}
}

function printRoutes() {
	results.sort((a, b) => a.ttl - b.ttl);

	var hops = results.filter(v => v.msg === 'TimeExceededError')
	var last = results.filter(v => v.msg === 'REPLY').shift()
	if (last) {
		hops.push(last);
	}
	console.log('------------')
	hops.forEach(line => {
		console.log(line.ttl, line.ip, line.addr)
	})

	if (last) {
		console.log('*', last);
		// setTimeout(() => process.exit(), 2000);
	}
}

function sendPing(dest, ttl, cb) {
	var reqId = generateId();
	ttl = ttl || 32;
	var o = {
		cb,
		ttl,
		dest,
		reqId
	}
	reqs[reqId] = o
	queue.push(o)
	flush()
}

function flush() {
	if (sending || !queue.length) return;
	sending = true;

	const {ttl, reqId, dest} = queue.shift();

	var header = Buffer.alloc(packetSize);
	header.writeUInt8(0x8, 0); // type
	header.writeUInt16BE(SESSION_ID, 4); // id
	header.writeUInt16BE (reqId, 6);
	header.writeUInt16LE(checksum(header), 2);

	console.log('---- sending with ttl', ttl);
	icmpSocket.setOption (raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, ttl);
	icmpSocket.send(header, 0, packetSize, dest, function(err, bytes) {
		console.log('sent', err, bytes);
		if (err) {

		}

		sending = false;
		flush();
	});
}



function dns_lookup(hostname) {
	return new Promise((ok, fail) => {
		dns.lookup(hostname, (err, address, family) => {
			if (err) return fail(err);
			ok(address);
		});
	})
}

function dns_reverse(ip) {
	return new Promise((ok, fail) => {
		dns.reverse(ip, (err, hostnames) => {
			if (err) return fail(err);
			ok(hostnames);
		});
	})
}

var SESSION_ID = process.id / 2 | 0;
var queue = [];
var sending = false;
var packetSize = 12;
var results = [];

async function main(target) {
	var ip = await dns_lookup(target);
	console.log('Tracing ip ', ip);
	traceRoute(ip);
}

var target = process.argv[2];
main(target);
