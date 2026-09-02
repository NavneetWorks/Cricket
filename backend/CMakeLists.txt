cmake_minimum_required(VERSION 3.15)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)
project(CricketGameServer C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- 1. WebRTC UDP (libdatachannel) ko Internet se download karna ---
include(FetchContent)
set(NO_MEDIA ON CACHE BOOL "" FORCE)
set(NO_EXAMPLES ON CACHE BOOL "" FORCE)
FetchContent_Declare(
    libdatachannel
    GIT_REPOSITORY https://github.com/paullouisageneau/libdatachannel.git
    GIT_TAG        v0.22.4
)
FetchContent_MakeAvailable(libdatachannel)

# --- 2. WebSockets (uSockets) ke paths ---
include_directories(${CMAKE_SOURCE_DIR}/libs/uWebSockets/src)
include_directories(${CMAKE_SOURCE_DIR}/libs/uWebSockets/uSockets/src)

# --- 3. uSockets ko compile karna ---
file(GLOB USOCKETS_SOURCES
    "libs/uWebSockets/uSockets/src/*.c"
    "libs/uWebSockets/uSockets/src/eventing/*.c"
    "libs/uWebSockets/uSockets/src/crypto/*.c"
)
add_library(uSockets STATIC ${USOCKETS_SOURCES})
target_compile_definitions(uSockets PUBLIC LIBUS_USE_EPOLL LIBUS_NO_SSL)

# --- 4. Aapka apna C++ Server Code ---
file(GLOB SOURCES "src/*.cpp")
add_executable(CricketServer ${SOURCES})

# --- 5. Dono libraries (datachannel aur uSockets) ko Server se jodna ---
target_link_libraries(CricketServer uSockets z datachannel pthread)