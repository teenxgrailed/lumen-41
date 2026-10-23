//! A quick reachability probe for the start page.

use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// True when a TCP connection to the app's host opens within a few seconds.
/// Blocking: call it from `spawn_blocking`, never from the UI thread. An
/// unresolvable start URL counts as online so the app still tries to load.
pub fn is_online() -> bool {
    let start = crate::start_url();
    let Some(host) = start.host_str() else {
        return true;
    };
    let port = start.port_or_known_default().unwrap_or(443);
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    addresses
        .take(2)
        .any(|address| TcpStream::connect_timeout(&address, Duration::from_secs(3)).is_ok())
}
