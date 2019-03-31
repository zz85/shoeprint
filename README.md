# Shoetrace
Utility to find out network hops to a destination. Like traceroute but fast. Like mtr but simple (no sudo needed).

## Usage

```sh
bin/shoetrace destination
```

## How it works

traceroute works by sending packets using low "time to live" (ttl) values. When ttl is decremented to zero along the path to the destination, intermediate routers sends an "time to live exceeded" ICMP packet back to the sender while dropping the packet. By collecting these breadcrumbs, we form a trail to the destination. The approach shoetrace takes to speed up the traceroute process is by optimistically sending the range of TTL packets as quickly as possible. For simplicity, shoetrace sends probes using ICMP (similar to mtr's default) instead of UDP (traceroute's default).

### Ideas
1. add curses like interface
2. add whois support
3. add AS support
4. add geoip support
5. release binaries with pkg