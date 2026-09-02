#pragma once
#include <rtc/rtc.hpp>
#include <iostream>
#include <memory>
#include <functional>
#include "NetworkProtocol.h"
#include "../libs/json/json.hpp"

using json = nlohmann::json;

class RTCManager{
    public:
        using PacketCallback = std::function<void(const rtc::binary&)>;

        RTCManager(int playerId,std::function<void(std::string)> sendWsMsg,PacketCallback packetForward = nullptr) : id(playerId), sendSignalingMessage(sendWsMsg),onPacketForward(packetForward) {
          
            rtc::Configuration config;
            config.iceServers.emplace_back("stun:stun.l.google.com:19302");

            // TURN Server configuration with Username & Password:
            rtc::IceServer turnServer("turn:openrelay.metered.ca:80");
            turnServer.username = "openrelay";
            turnServer.password = "openrelay";
            config.iceServers.push_back(turnServer);

            peerConnection = std::make_shared<rtc::PeerConnection>(config);

            peerConnection->onLocalDescription([this](rtc::Description description) {
                std::cout << "[RTCManager] Local Description generate hua";
                json msg = {{"type", description.typeString()}, {"sdp", std::string(description)}};
                sendSignalingMessage(msg.dump());
            });

            peerConnection->onLocalCandidate([this](rtc::Candidate candidate) {
                std::cout << "Naya ICE Candidate mila!\n";
                json msg = {{"type", "candidate"}, {"candidate", std::string(candidate)}, {"mid", candidate.mid()}};
                sendSignalingMessage(msg.dump());
            });
            peerConnection->onDataChannel([this](std::shared_ptr<rtc::DataChannel> dc) {
                std::cout << "🚀 [WebRTC] UDP DATA CHANNEL OPEN for Player " << id << "!\n";
                dataChannel = dc;
            
                // Jab UDP se message aayega
                 dc->onMessage([this](std::variant<rtc::binary, rtc::string> data) {
                    if (std::holds_alternative<rtc::binary>(data)) {
                        auto binaryData = std::get<rtc::binary>(data);
                        if(binaryData.size() >= sizeof(PacketHeader)){
                            if(onPacketForward){
                                onPacketForward(binaryData);
                            }
                        }                        
                      
                    }
                });
            });

            peerConnection->onStateChange([this](rtc::PeerConnection::State state) {
                std::cout << "WebRTC State: " << state << "\n";
            });
        }

        ~RTCManager() {
            if (peerConnection) peerConnection->close();
        }
        void sendUDP(const rtc::binary& data) {
            if (dataChannel && dataChannel->isOpen()) {
                dataChannel->send(data);
            }
        }
        int id;
        std::shared_ptr<rtc::PeerConnection> peerConnection;
        std::function<void(std::string)> sendSignalingMessage;
        PacketCallback onPacketForward;
        std::shared_ptr<rtc::DataChannel> dataChannel;

};