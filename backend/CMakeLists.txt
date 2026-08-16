cmake_minimum_required(VERSION 3.15)
# Yahan 'C' aur 'CXX' dono languages add kar di gayi hain
project(CricketGameServer C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- 1. Rasta Dikhana ---
include_directories(${CMAKE_SOURCE_DIR}/libs/uWebSockets/src)
include_directories(${CMAKE_SOURCE_DIR}/libs/uWebSockets/uSockets/src)

# --- 2. uSockets ko manually Compile Karna ---
file(GLOB USOCKETS_SOURCES
    "libs/uWebSockets/uSockets/src/*.c"
    "libs/uWebSockets/uSockets/src/eventing/*.c"
    "libs/uWebSockets/uSockets/src/crypto/*.c"
)
add_library(uSockets STATIC ${USOCKETS_SOURCES})
# Linux (Bluefin) me best performance ke liye Epoll on karna zaroori hai
target_compile_definitions(uSockets PUBLIC LIBUS_USE_EPOLL LIBUS_NO_SSL)

# --- 3. Aapka C++ Server Code ---
file(GLOB SOURCES "src/*.cpp")
add_executable(CricketServer ${SOURCES})

# --- 4. Sabko Ek Sath Jodna ---
target_link_libraries(CricketServer uSockets z)