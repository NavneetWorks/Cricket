# Install script for directory: /var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/usr/local")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Install shared libraries without execute permission?
if(NOT DEFINED CMAKE_INSTALL_SO_NO_EXE)
  set(CMAKE_INSTALL_SO_NO_EXE "0")
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set path to fallback-tool for dependency-resolution.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/usr/bin/objdump")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  foreach(file
      "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/libdatachannel.so.0.21.2"
      "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/libdatachannel.so.0.21"
      )
    if(EXISTS "${file}" AND
       NOT IS_SYMLINK "${file}")
      file(RPATH_CHECK
           FILE "${file}"
           RPATH "")
    endif()
  endforeach()
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib64" TYPE SHARED_LIBRARY FILES
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/libdatachannel.so.0.21.2"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/libdatachannel.so.0.21"
    )
  foreach(file
      "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/libdatachannel.so.0.21.2"
      "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/libdatachannel.so.0.21"
      )
    if(EXISTS "${file}" AND
       NOT IS_SYMLINK "${file}")
      if(CMAKE_INSTALL_DO_STRIP)
        execute_process(COMMAND "/usr/bin/strip" "${file}")
      endif()
    endif()
  endforeach()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib64" TYPE SHARED_LIBRARY FILES "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/libdatachannel.so")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/rtc" TYPE FILE FILES
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/candidate.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/channel.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/configuration.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/datachannel.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/description.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/mediahandler.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtcpreceivingsession.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/common.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/global.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/message.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/frameinfo.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/peerconnection.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/reliability.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtc.h"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtc.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtp.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/track.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/websocket.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/websocketserver.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtppacketizationconfig.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtcpsrreporter.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtppacketizer.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtpdepacketizer.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/h264rtppacketizer.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/h264rtpdepacketizer.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/nalunit.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/h265rtppacketizer.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/h265nalunit.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/av1rtppacketizer.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/nalunit.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/rtcpnackresponder.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/utils.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/plihandler.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/pacinghandler.hpp"
    "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/include/rtc/version.h"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel/LibDataChannelTargets.cmake")
    file(DIFFERENT _cmake_export_file_changed FILES
         "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel/LibDataChannelTargets.cmake"
         "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/CMakeFiles/Export/76554972cce751be1f76dec8ae27d2f9/LibDataChannelTargets.cmake")
    if(_cmake_export_file_changed)
      file(GLOB _cmake_old_config_files "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel/LibDataChannelTargets-*.cmake")
      if(_cmake_old_config_files)
        string(REPLACE ";" ", " _cmake_old_config_files_text "${_cmake_old_config_files}")
        message(STATUS "Old export file \"$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel/LibDataChannelTargets.cmake\" will be replaced.  Removing files [${_cmake_old_config_files_text}].")
        unset(_cmake_old_config_files_text)
        file(REMOVE ${_cmake_old_config_files})
      endif()
      unset(_cmake_old_config_files)
    endif()
    unset(_cmake_export_file_changed)
  endif()
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel" TYPE FILE FILES "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/CMakeFiles/Export/76554972cce751be1f76dec8ae27d2f9/LibDataChannelTargets.cmake")
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^()$")
    file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel" TYPE FILE FILES "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/CMakeFiles/Export/76554972cce751be1f76dec8ae27d2f9/LibDataChannelTargets-noconfig.cmake")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel" TYPE FILE FILES "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-src/cmake/LibDataChannelConfig.cmake")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib64/cmake/LibDataChannel" TYPE FILE FILES "/var/home/navneet/Documents/Cricket_Game/backend/build/LibDataChannelConfigVersion.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for each subdirectory.

endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
if(CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/var/home/navneet/Documents/Cricket_Game/backend/build/_deps/libdatachannel-build/install_local_manifest.txt"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
